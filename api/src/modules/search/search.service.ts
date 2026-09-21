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
  /** Only documents filed as this type (SRC-4). */
  documentTypeId?: string;
  /** Criteria against that type's index fields. Combined with AND (SRC-4). */
  fields?: FieldCriterion[];
  sort?: 'relevance' | 'modified' | 'created' | 'name' | 'size';
  skip?: number;
  take?: number;
}

/**
 * One condition on one index field.
 *
 * `between` uses both values; `set` and `unset` use neither. Everything else
 * uses `value` alone.
 */
export interface FieldCriterion {
  fieldId: string;
  op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains' | 'between' | 'set' | 'unset';
  value?: string | number | boolean;
  value2?: string | number | boolean;
}

const OPERATOR: Record<string, string> = {
  eq: '=',
  ne: '<>',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
};

/** Which column of document_field_values holds a value of each kind. */
const VALUE_COLUMN: Record<string, string> = {
  TEXT: 'valueText',
  SELECT: 'valueText',
  DATE: 'valueDate',
  NUMBER: 'valueNumber',
  BOOLEAN: 'valueBool',
};

/** Everything the two statements need to agree on. */
interface Scope {
  user: AuthUser;
  params: SearchParams;
  folderIds: string[] | null;
  useContent: boolean;
  /** Kind per referenced index field, so a criterion knows which column to read. */
  fieldKinds: Map<string, string>;
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

    // A criterion names a field by id, but the column it compares depends on
    // the field's kind — so the kinds are read once, here, rather than being
    // trusted from the caller. Scoping the lookup to the organisation is also
    // what stops a criterion naming another tenant's field id.
    const fieldKinds = new Map<string, string>();
    const wanted = (params.fields ?? []).map((f) => f.fieldId);
    if (wanted.length) {
      const known = await this.db.query<{ id: string; kind: string }>(
        `SELECT id, kind FROM document_type_fields
          WHERE "organizationId" = $1 AND id = ANY($2::text[])`,
        [user.organizationId, wanted],
      );
      for (const f of known) fieldKinds.set(f.id, f.kind);
    }

    const scope: Scope = {
      user,
      params,
      folderIds,
      useContent: Boolean(params.inContent && params.q),
      fieldKinds,
    };
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
  private whereClause({ user, params, folderIds, useContent, fieldKinds }: Scope, p: Params): string {
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
      params.documentTypeId ? `d."documentTypeId" = ${p.add(params.documentTypeId)}` : null,
      // SRC-4. One EXISTS per criterion, so several conditions on the same type
      // mean "all of these" rather than "any of them" — "contracts expiring in
      // 2027 whose value is above four hundred million" is two conditions on
      // two fields, and both must hold of the same document.
      ...(params.fields ?? []).map((c) => this.fieldPredicate(c, fieldKinds, p)),
      // Content mode matches the indexed body; otherwise the name only.
      useContent
        ? `di.tsv @@ websearch_to_tsquery('english', ${p.add(params.q)})`
        : params.q
          ? `d.name ILIKE ${p.add(contains(params.q))} ESCAPE '\\'`
          : null,
    ]);
  }

  /**
   * One condition on one index field, as an EXISTS against its value row.
   *
   * The column is chosen from the field's kind rather than from anything the
   * caller sent, and the operator comes from a fixed map — so neither reaches
   * the statement as text. `unset` is the one case that inverts to NOT EXISTS,
   * which also covers a document of the right type that was never filled in.
   *
   * An unknown field id yields `null`, dropping the criterion rather than
   * matching everything: a filter naming a field that does not exist in this
   * tenant should narrow nothing, not silently widen the result.
   */
  private fieldPredicate(c: FieldCriterion, kinds: Map<string, string>, p: Params): string | null {
    const kind = kinds.get(c.fieldId);
    if (!kind) return 'FALSE';

    const col = VALUE_COLUMN[kind];

    // Every reason to drop this criterion is decided before a single parameter
    // is bound. Adding one and then returning null leaves the statement
    // supplied with a parameter it never references, which Postgres rejects
    // outright — the whole search fails rather than the criterion being
    // ignored.
    const usable =
      c.op === 'set' ||
      c.op === 'unset' ||
      (c.op === 'between' && c.value !== undefined && c.value2 !== undefined) ||
      (c.op === 'contains' && col === 'valueText' && c.value !== undefined) ||
      (OPERATOR[c.op] !== undefined && c.value !== undefined);
    if (!usable) return null;

    const base = `SELECT 1 FROM document_field_values fv
                   WHERE fv."documentId" = d.id AND fv."fieldId" = ${p.add(c.fieldId)}`;

    // `unset` also requires the document to be of a type that HAS this field.
    // Without that it matches every delivery note and every untyped scan,
    // which is true but not the question anybody asked.
    if (c.op === 'set') return `EXISTS (${base})`;
    if (c.op === 'unset') {
      return `(NOT EXISTS (${base})
               AND EXISTS (SELECT 1 FROM document_type_fields tf
                            WHERE tf.id = ${p.add(c.fieldId)}
                              AND tf."documentTypeId" = d."documentTypeId"))`;
    }

    if (c.op === 'between') {
      return `EXISTS (${base}
                AND fv."${col}" >= ${p.add(this.coerce(kind, c.value!))}
                AND fv."${col}" <= ${p.add(this.coerce(kind, c.value2!))})`;
    }

    // `contains` is text only. On a date or a number it has no meaning, and
    // silently treating it as equality would answer a different question than
    // the one asked — so it was dropped above rather than reinterpreted.
    if (c.op === 'contains') {
      return `EXISTS (${base} AND fv."valueText" ILIKE ${p.add(contains(String(c.value)))} ESCAPE '\\')`;
    }

    return `EXISTS (${base} AND fv."${col}" ${OPERATOR[c.op]} ${p.add(this.coerce(kind, c.value!))})`;
  }

  /** A criterion arrives as text from a query string; the column is typed. */
  private coerce(kind: string, value: string | number | boolean) {
    if (kind === 'NUMBER') return Number(value);
    if (kind === 'DATE') return new Date(String(value));
    if (kind === 'BOOLEAN') return value === true || value === 'true' || value === 'yes';
    return String(value);
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
