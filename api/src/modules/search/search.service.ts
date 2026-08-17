import { Injectable } from '@nestjs/common';
import { Classification, ContentKind, DatabaseService, Params, every, newId } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';

export interface SearchParams {
  /** Free text. Matched against the name and, with `inContent`, the body. */
  q?: string;
  /** Search inside document text (OCR + extracted) as well as the name. */
  inContent?: boolean;
  /** Limit to one folder subtree. */
  folderId?: string;
  kind?: ContentKind;
  classification?: Classification;
  mimeType?: string;
  ownerId?: string;
  tag?: string;
  /** Last-modified window (feature 7). */
  modifiedFrom?: Date;
  modifiedTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  sizeMin?: number;
  sizeMax?: number;
  sort?: 'relevance' | 'modified' | 'created' | 'name' | 'size';
  skip?: number;
  take?: number;
}

/** Everything the two statements need to agree on. */
interface Scope {
  user: AuthUser;
  params: SearchParams;
  folderIds: string[] | null;
  useContent: boolean;
}

/**
 * Search across the repository (features 6 and 7).
 *
 * Two modes:
 *   - metadata only (default): an indexed query on name, kind, dates, owner,
 *     classification.
 *   - `inContent`: adds a Postgres full-text match against document_index.tsv,
 *     ranked, with a highlighted snippet.
 *
 * Both are constrained to folders the caller can read. Filtering after the
 * fact would still leak existence through result counts, so the restriction
 * goes into the query itself.
 *
 * Content mode is one statement, not two. The previous version ran the ranking
 * query and the metadata query separately, applied LIMIT/OFFSET to both, and
 * then re-sorted by rank in memory — so page two was drawn from a set already
 * truncated by relevance, and `total` agreed with neither.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async search(user: AuthUser, params: SearchParams) {
    const take = Math.min(params.take ?? 25, 100);
    const skip = params.skip ?? 0;

    const readable = await this.access.readableFolderIds(user);
    if (readable !== null && readable.length === 0 && !params.q) {
      return { items: [], total: 0, mode: 'metadata' as const };
    }

    let folderIds: string[] | null = readable;
    if (params.folderId) {
      const folder = await this.db.maybeOne<{ path: string }>(
        `SELECT path FROM folders
          WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
        [params.folderId, user.organizationId],
      );
      if (!folder) return { items: [], total: 0, mode: 'metadata' as const };

      const subtree = await this.db.query<{ id: string }>(
        `SELECT id FROM folders
          WHERE "organizationId" = $1 AND starts_with(path, $2) AND "deletedAt" IS NULL`,
        [user.organizationId, folder.path],
      );
      const ids = subtree.map((f) => f.id);
      folderIds = readable === null ? ids : ids.filter((id) => readable.includes(id));
    }

    const scope: Scope = { user, params, folderIds, useContent: Boolean(params.inContent && params.q) };
    const join = scope.useContent ? `JOIN document_index di ON di."documentId" = d.id` : '';

    // Each statement gets its own Params. Postgres rejects a statement supplied
    // with a parameter it does not reference, and the count does not select the
    // rank or the snippet — so they cannot share one list. The shared builder
    // is what stops the two predicates drifting apart.
    const pageParams = new Params();
    const pageWhere = this.whereClause(scope, pageParams);

    const rankExpr = scope.useContent
      ? `websearch_to_tsquery('english', ${pageParams.add(params.q)})`
      : '';

    const extras = scope.useContent
      ? `, ts_rank(di.tsv, ${rankExpr}) AS rank,
           ts_headline('english', di."contentText", ${rankExpr},
                       'MaxWords=30, MinWords=10, ShortWord=3, MaxFragments=2') AS snippet`
      : '';

    const items = await this.db.query(
      `SELECT d.*,
              CASE WHEN v.id IS NULL THEN NULL ELSE
                json_build_object('versionNumber', v."versionNumber",
                                  'sizeBytes', v."sizeBytes",
                                  'pageCount', v."pageCount") END AS "currentVersion",
              CASE WHEN f.id IS NULL THEN NULL ELSE
                json_build_object('id', f.id, 'name', f.name, 'path', f.path) END AS folder,
              CASE WHEN o.id IS NULL THEN NULL ELSE
                json_build_object('id', o.id, 'displayName', o."displayName") END AS owner
              ${extras}
         FROM documents d
         ${join}
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
         LEFT JOIN folders f ON f.id = d."folderId"
         LEFT JOIN users o   ON o.id = d."ownerId"
        WHERE ${pageWhere}
        ORDER BY ${this.orderBy(params.sort, scope.useContent)}
        LIMIT ${pageParams.add(take)} OFFSET ${pageParams.add(skip)}`,
      pageParams.values,
    );

    const countParams = new Params();
    const countWhere = this.whereClause(scope, countParams);

    const total = await this.db.count(
      `SELECT count(*)
         FROM documents d
         ${join}
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
        WHERE ${countWhere}`,
      countParams.values,
    );

    return { items, total, mode: scope.useContent ? ('content' as const) : ('metadata' as const) };
  }

  /**
   * The predicate both statements share.
   *
   * Tenant scope is the first condition and is never optional — every other
   * filter narrows within one organisation.
   */
  private whereClause({ user, params, folderIds, useContent }: Scope, p: Params): string {
    return every([
      `d."organizationId" = ${p.add(user.organizationId)}`,
      `d."deletedAt" IS NULL`,
      folderIds === null
        ? null
        : `(d."folderId" = ANY(${p.add(folderIds)}::text[]) OR d."ownerId" = ${p.add(user.id)})`,
      params.kind ? `d.kind = ${p.add(params.kind)}` : null,
      params.classification ? `d.classification = ${p.add(params.classification)}` : null,
      params.mimeType ? `d."mimeType" ILIKE ${p.add(contains(params.mimeType))} ESCAPE '\\'` : null,
      params.ownerId ? `d."ownerId" = ${p.add(params.ownerId)}` : null,
      params.tag
        ? `EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt."tagId"
                    WHERE dt."documentId" = d.id AND t.name = ${p.add(params.tag)})`
        : null,
      params.modifiedFrom ? `d."updatedAt" >= ${p.add(params.modifiedFrom)}` : null,
      params.modifiedTo ? `d."updatedAt" <= ${p.add(params.modifiedTo)}` : null,
      params.createdFrom ? `d."createdAt" >= ${p.add(params.createdFrom)}` : null,
      params.createdTo ? `d."createdAt" <= ${p.add(params.createdTo)}` : null,
      params.sizeMin != null ? `v."sizeBytes" >= ${p.add(params.sizeMin)}` : null,
      params.sizeMax != null ? `v."sizeBytes" <= ${p.add(params.sizeMax)}` : null,
      // Content mode matches the indexed body; otherwise the name only.
      useContent
        ? `di.tsv @@ websearch_to_tsquery('english', ${p.add(params.q)})`
        : params.q
          ? `d.name ILIKE ${p.add(contains(params.q))} ESCAPE '\\'`
          : null,
    ]);
  }

  /** Whitelisted sort expressions — an ORDER BY cannot be a bound parameter. */
  private orderBy(sort: SearchParams['sort'], hasRelevance: boolean): string {
    switch (sort) {
      case 'created':
        return 'd."createdAt" DESC';
      case 'name':
        return 'd.name ASC';
      case 'size':
        return 'v."sizeBytes" DESC NULLS LAST';
      case 'modified':
        return 'd."updatedAt" DESC';
      default:
        return hasRelevance ? 'rank DESC, d."updatedAt" DESC' : 'd."updatedAt" DESC';
    }
  }

  /**
   * Rebuilds the searchable text for one document. Called by the indexing job
   * after OCR, and directly for plain-text uploads.
   *
   * `tsv` is a generated column the database maintains from contentText and
   * title, so it is never written here.
   */
  async reindex(documentId: string, contentText: string, title: string, versionId?: string): Promise<void> {
    const wordCount = contentText.split(/\s+/).filter(Boolean).length;

    // document_index is keyed on documentId — one index row per document, no
    // surrogate id of its own.
    await this.db.execute(
      `INSERT INTO document_index ("documentId", "contentText", title, "wordCount", "versionId", "indexedAt")
            VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT ("documentId")
     DO UPDATE SET "contentText" = EXCLUDED."contentText",
                   title         = EXCLUDED.title,
                   "wordCount"   = EXCLUDED."wordCount",
                   "versionId"   = EXCLUDED."versionId",
                   "indexedAt"   = now()`,
      [documentId, contentText, title, wordCount, versionId ?? null],
    );
  }
}

/** Escapes LIKE metacharacters so a typed `%` matches a literal percent sign. */
function contains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
