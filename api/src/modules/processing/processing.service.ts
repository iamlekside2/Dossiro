import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccessLevel, DatabaseService, JobStatus, JobType, newId } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';
import { SearchService } from '../search/search.service';
import { StorageService } from '../storage/storage.service';

/**
 * Where a job's text came from, so a reader can weigh it.
 *
 * A PDF's own text layer is what the author typed. Recognised text is a guess
 * about pixels. Conflating them is how a search result comes to be trusted
 * more than it deserves.
 */
export type TextSource = 'plain' | 'pdf-text-layer' | 'recognised';

export interface Extracted {
  text: string;
  source: TextSource;
  pages?: number;
}

/**
 * The document pipeline.
 *
 * The queue table has existed since the baseline with nothing draining it.
 * This drains it: a job per document, claimed one at a time, retried on
 * failure up to its own limit, and written back with what it produced.
 *
 * Text extraction is the step everything else waits on, and it is honest about
 * which of three positions a document is in:
 *
 *   - plain text, which needs no extraction at all
 *   - a PDF with a text layer, where the words are already in the file
 *   - a scan or a photograph, where they are not
 *
 * The third needs optical character recognition, which needs a recognition
 * engine this deployment does not have. Those jobs are failed with that stated
 * rather than retried forever or quietly marked done, because a document
 * recorded as indexed and holding no text is worse than one plainly waiting:
 * the first disappears from search with nobody noticing.
 */
@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly search: SearchService,
    private readonly access: AccessService,
  ) {}

  /* -- Enqueueing -------------------------------------------------------------- */

  /** Puts a job on the queue. Safe to call twice; the second is ignored. */
  async enqueue(documentId: string, type: JobType, input: Record<string, unknown> = {}) {
    const existing = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM processing_jobs
        WHERE "documentId" = $1 AND type = $2 AND status IN ('PENDING', 'RUNNING')`,
      [documentId, type],
    );
    if (existing) return existing.id;

    const id = newId();
    await this.db.execute(
      `INSERT INTO processing_jobs (id, "documentId", type, status, input)
       VALUES ($1, $2, $3, 'PENDING', $4)`,
      [id, documentId, type, JSON.stringify(input)],
    );
    return id;
  }

  /* -- Draining ---------------------------------------------------------------- */

  /**
   * Runs up to `limit` jobs.
   *
   * Claimed with SKIP LOCKED so two workers never take the same job, which
   * matters the moment this runs anywhere with more than one process.
   */
  async drain(limit = 10): Promise<{ ran: number; failed: number }> {
    let ran = 0;
    let failed = 0;

    for (let i = 0; i < limit; i += 1) {
      const job = await this.claim();
      if (!job) break;

      try {
        const output = await this.run(job);
        await this.db.execute(
          `UPDATE processing_jobs
              SET status = 'SUCCEEDED', output = $1, "finishedAt" = now(), error = NULL
            WHERE id = $2`,
          [JSON.stringify(output), job.id],
        );
        ran += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const terminal = err instanceof UnsupportedInput || job.attempts + 1 >= job.maxAttempts;

        await this.db.execute(
          `UPDATE processing_jobs
              SET status = $1, error = $2, "finishedAt" = CASE WHEN $3 THEN now() ELSE NULL END
            WHERE id = $4`,
          [terminal ? JobStatus.FAILED : JobStatus.PENDING, message, terminal, job.id],
        );
        failed += 1;

        // An unsupported input is a statement about this deployment, not a
        // fault, so it is not logged as one.
        if (!(err instanceof UnsupportedInput)) {
          this.logger.warn(`Job ${job.type} on ${job.documentId} failed: ${message}`);
        }
      }
    }

    return { ran, failed };
  }

  /** Takes the oldest pending job, marking it running in the same statement. */
  private async claim() {
    return this.db.maybeOne<{
      id: string;
      documentId: string;
      type: JobType;
      attempts: number;
      maxAttempts: number;
      input: Record<string, unknown>;
    }>(
      `UPDATE processing_jobs
          SET status = 'RUNNING', "startedAt" = now(), attempts = attempts + 1
        WHERE id = (
          SELECT id FROM processing_jobs
           WHERE status = 'PENDING' AND attempts < "maxAttempts"
           ORDER BY "createdAt" ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
       RETURNING id, "documentId", type, attempts, "maxAttempts", input`,
    );
  }

  private async run(job: { id: string; documentId: string; type: JobType }) {
    switch (job.type) {
      case JobType.TEXT_INDEX:
        return this.indexText(job.documentId);
      default:
        throw new UnsupportedInput(
          `${job.type} is not built. The pipeline runs it as far as being asked for.`,
        );
    }
  }

  /* -- Text extraction ---------------------------------------------------------- */

  /** Pulls a document's words out and puts them in the search index. */
  private async indexText(documentId: string) {
    const doc = await this.db.maybeOne<{
      id: string;
      name: string;
      mimeType: string;
      storageKey: string | null;
      versionId: string | null;
    }>(
      `SELECT d.id, d.name, d."mimeType", v."storageKey", v.id AS "versionId"
         FROM documents d
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
        WHERE d.id = $1 AND d."deletedAt" IS NULL`,
      [documentId],
    );
    if (!doc) throw new UnsupportedInput('The document has been deleted.');
    if (!doc.storageKey) throw new Error('The document has no stored content.');

    // Storage exposes a stream; the extractors want the whole file, and a
    // document small enough to index is small enough to hold.
    const stream = await this.storage.getStream(doc.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    const extracted = await extractText(buffer, doc.mimeType);

    await this.search.reindex(doc.id, extracted.text, doc.name, doc.versionId ?? undefined);

    return {
      source: extracted.source,
      characters: extracted.text.length,
      pages: extracted.pages ?? null,
    };
  }

  /* -- Reading the queue --------------------------------------------------------- */

  /** What is on the queue, for the Ingest screen. */
  async queue(organizationId: string, status?: JobStatus) {
    const items = await this.db.query(
      `SELECT j.id, j.type, j.status, j.attempts, j."maxAttempts", j.error,
              j."createdAt", j."startedAt", j."finishedAt", j.output,
              d.name AS "documentName", d."mimeType", d.id AS "documentId",
              f.name AS "folderName"
         FROM processing_jobs j
         JOIN documents d ON d.id = j."documentId"
         LEFT JOIN folders f ON f.id = d."folderId"
        WHERE d."organizationId" = $1
          AND ($2::"JobStatus" IS NULL OR j.status = $2)
        ORDER BY j."createdAt" DESC
        LIMIT 200`,
      [organizationId, status ?? null],
    );

    const counts = await this.db.query<{ status: JobStatus; n: string }>(
      `SELECT j.status, count(*) AS n
         FROM processing_jobs j
         JOIN documents d ON d.id = j."documentId"
        WHERE d."organizationId" = $1
        GROUP BY j.status`,
      [organizationId],
    );

    return {
      items,
      total: items.length,
      counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
    };
  }

  /** Puts a failed job back, for something that has since been fixed. */
  async retry(user: AuthUser, jobId: string) {
    // The route addresses a job, so @RequireAccess cannot resolve it to the
    // document the way it does for reindex. Resolved here instead: requeuing
    // work on a record is a write to that record, whoever asked for it.
    const job = await this.db.maybeOne<{ documentId: string }>(
      `SELECT j."documentId"
         FROM processing_jobs j
         JOIN documents d ON d.id = j."documentId"
        WHERE j.id = $1 AND d."organizationId" = $2`,
      [jobId, user.organizationId],
    );
    if (!job) throw new NotFoundException('No such job.');
    await this.access.assertDocument(user, job.documentId, AccessLevel.WRITE);

    const organizationId = user.organizationId;
    const done = await this.db.execute(
      `UPDATE processing_jobs j
          SET status = 'PENDING', attempts = 0, error = NULL, "finishedAt" = NULL
         FROM documents d
        WHERE d.id = j."documentId"
          AND j.id = $1
          AND d."organizationId" = $2
          AND j.status = 'FAILED'`,
      [jobId, organizationId],
    );
    return { requeued: done > 0 };
  }
}

/**
 * An input this deployment cannot handle, as opposed to a step that went
 * wrong. Retrying it would produce the same answer three times.
 */
export class UnsupportedInput extends Error {}

/* -- The extractors ------------------------------------------------------------- */

const TEXTUAL = /^text\/|json|xml|csv|javascript/;

/**
 * A document's words, and where they came from.
 *
 * Exported so the shape can be tested without a queue, a database or a file.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<Extracted> {
  if (TEXTUAL.test(mimeType)) {
    return { text: buffer.toString('utf8'), source: 'plain' };
  }

  if (/pdf/.test(mimeType)) {
    // Imported here rather than at the top: only PDFs need it, and it pulls
    // in the whole of pdf.js.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let text = '';
    let pages: number | undefined;
    try {
      const result = await parser.getText();
      text = (result.text ?? '').trim();
      pages = result.pages?.length;
    } finally {
      // Holds a pdf.js worker open otherwise, and this runs in a loop.
      await parser.destroy();
    }

    if (!text) {
      throw new UnsupportedInput(
        'This PDF has no text layer, so its words exist only as pixels. Reading them needs '
          + 'optical character recognition, which is not installed on this deployment.',
      );
    }
    return { text, source: 'pdf-text-layer', pages };
  }

  if (/^image\//.test(mimeType)) {
    throw new UnsupportedInput(
      'An image holds no text to read. Recognising it needs optical character recognition, '
        + 'which is not installed on this deployment.',
    );
  }

  throw new UnsupportedInput(`Nothing here can read ${mimeType}.`);
}
