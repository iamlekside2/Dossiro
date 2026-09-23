import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, DatabaseService, FieldKind, newId } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { SearchService } from '../search/search.service';
import { WorkflowService } from '../workflow/workflow.service';

export interface FormField {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  help?: string;
}

/** A form as it comes back from the database, with its fields unwrapped. */
export interface StoredForm {
  id: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  targetFolderId: string | null;
  targetFolderName: string | null;
  workflowDefinitionId: string | null;
  workflowName: string | null;
  fields: FormField[];
}

export interface FormInput {
  name: string;
  description?: string;
  fields?: FormField[];
  targetFolderId?: string | null;
  workflowDefinitionId?: string | null;
}

/**
 * E-forms (SIG-5, SIG-6).
 *
 * A form is a way of collecting a record that does not exist yet. The
 * requirement is not the builder — it is what happens afterwards: "the
 * submission is filed, indexed, searchable, and triggers routing". So a
 * submission is not a row in a side table that somebody exports later. It
 * becomes a document, in a folder, with its text indexed, and whatever
 * workflow the form nominates starts against it.
 *
 * That is why this service depends on documents, search and workflow rather
 * than owning storage of its own. A submission that is not a record would need
 * its own permissions, its own retention, its own audit — three systems
 * reimplemented worse, and a second place to look for something.
 */
@Injectable()
export class FormsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly documents: DocumentsService,
    private readonly search: SearchService,
    private readonly workflow: WorkflowService,
  ) {}

  /* -- Definitions ------------------------------------------------------------ */

  async list(user: AuthUser) {
    const items = await this.db.query(
      `SELECT f.id, f.name, f.description, f."isPublished", f."targetFolderId",
              f."workflowDefinitionId", f."createdAt",
              fo.name AS "targetFolderName",
              w.name AS "workflowName",
              jsonb_array_length(COALESCE(f.schema->'fields', '[]'::jsonb)) AS "fieldCount",
              COALESCE(s.n, 0) AS "submissionCount"
         FROM form_definitions f
         LEFT JOIN folders fo ON fo.id = f."targetFolderId"
         LEFT JOIN workflow_definitions w ON w.id = f."workflowDefinitionId"
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM form_submissions
                             WHERE "formId" = f.id) s ON TRUE
        WHERE f."organizationId" = $1
        ORDER BY f."isPublished" DESC, f.name ASC`,
      [user.organizationId],
    );
    return { items, total: items.length };
  }

  async get(user: AuthUser, id: string): Promise<StoredForm> {
    const form = await this.db.maybeOne<StoredForm & { schema: { fields?: FormField[] } }>(
      `SELECT f.*, fo.name AS "targetFolderName", w.name AS "workflowName"
         FROM form_definitions f
         LEFT JOIN folders fo ON fo.id = f."targetFolderId"
         LEFT JOIN workflow_definitions w ON w.id = f."workflowDefinitionId"
        WHERE f.id = $1 AND f."organizationId" = $2`,
      [id, user.organizationId],
    );
    if (!form) throw new NotFoundException('No such form.');
    return { ...form, fields: form.schema?.fields ?? [] };
  }

  async create(user: AuthUser, input: FormInput) {
    const id = newId();
    await this.db.execute(
      `INSERT INTO form_definitions
         (id, "organizationId", name, description, schema, "targetFolderId",
          "workflowDefinitionId", "isPublished", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, now())`,
      [
        id,
        user.organizationId,
        input.name.trim(),
        input.description ?? null,
        JSON.stringify({ fields: input.fields ?? [] }),
        input.targetFolderId ?? null,
        input.workflowDefinitionId ?? null,
      ],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'Form',
      resourceId: id,
      resourceName: input.name,
      metadata: { event: 'form_created' },
    });

    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, input: Partial<FormInput>) {
    const form = await this.get(user, id);

    await this.db.execute(
      `UPDATE form_definitions
          SET name = COALESCE($1, name),
              description = COALESCE($2, description),
              schema = COALESCE($3::jsonb, schema),
              "targetFolderId" = COALESCE($4, "targetFolderId"),
              "workflowDefinitionId" = COALESCE($5, "workflowDefinitionId"),
              "updatedAt" = now()
        WHERE id = $6 AND "organizationId" = $7`,
      [
        input.name?.trim() ?? null,
        input.description ?? null,
        input.fields ? JSON.stringify({ fields: input.fields }) : null,
        input.targetFolderId ?? null,
        input.workflowDefinitionId ?? null,
        id,
        user.organizationId,
      ],
    );

    void form;
    return this.get(user, id);
  }

  /**
   * Publishing opens the form to submissions.
   *
   * Refused without a field or without somewhere to file what arrives. A form
   * that collects nothing, or that collects into nowhere, produces submissions
   * nobody can find — which is the same as losing them.
   */
  async setPublished(user: AuthUser, id: string, published: boolean) {
    const form = await this.get(user, id);

    if (published) {
      if (form.fields.length === 0) {
        throw new BadRequestException('A form needs at least one field before it can be published.');
      }
      if (!form.targetFolderId) {
        throw new BadRequestException(
          'Choose where submissions are filed before publishing. A submission with no folder is one nobody can find.',
        );
      }
    }

    await this.db.execute(
      'UPDATE form_definitions SET "isPublished" = $1, "updatedAt" = now() WHERE id = $2',
      [published, id],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'Form',
      resourceId: id,
      resourceName: form.name,
      metadata: { event: published ? 'form_published' : 'form_withdrawn' },
    });

    return this.get(user, id);
  }

  /* -- Submitting -------------------------------------------------------------- */

  /**
   * Records a submission as a document, then starts whatever the form
   * nominates (SIG-6).
   *
   * The whole thing is one transaction-ish sequence with the document first:
   * if filing fails there is nothing to route, and a submission row pointing
   * at no document would be a record of something that did not happen.
   */
  async submit(user: AuthUser, formId: string, data: Record<string, unknown>) {
    const form = await this.get(user, formId);
    if (!form.isPublished) {
      throw new BadRequestException('This form is not open for submissions.');
    }

    const fields = form.fields;
    for (const f of fields) {
      const value = data[f.key];
      if (f.required && (value === undefined || value === null || String(value).trim() === '')) {
        throw new BadRequestException(`${f.label} is required.`);
      }
      if (f.kind === FieldKind.SELECT && value && !(f.options ?? []).includes(String(value))) {
        throw new BadRequestException(`“${value}” is not one of the options for ${f.label}.`);
      }
    }

    // Rendered as text rather than stored only as JSON, so the submission is
    // searchable by its own content the way every other record is. A form
    // answer nobody can search for is a form answer nobody will find.
    const body = [
      form.name,
      `Submitted ${new Date().toISOString()}`,
      '',
      ...fields.map((f) => `${f.label}: ${format(data[f.key])}`),
    ].join('\n');

    const stamp = new Date().toISOString().slice(0, 10);
    const document = await this.documents.ingest(user, {
      buffer: Buffer.from(body, 'utf8'),
      originalName: `${form.name} — ${stamp}.txt`,
      mimeType: 'text/plain',
      folderId: form.targetFolderId,
      description: `Submission to ${form.name}`,
    });

    // Indexed here rather than by ingest, which has no opinion about content.
    await this.search.reindex(document.id, body, document.name);

    const submissionId = newId();
    await this.db.execute(
      `INSERT INTO form_submissions (id, "formId", data, "submittedById", "documentId")
       VALUES ($1, $2, $3, $4, $5)`,
      [submissionId, formId, JSON.stringify(data), user.id, document.id],
    );

    // Routing last: a submission that is filed but unrouted can be picked up
    // by hand, where one that is routed but unfiled points at nothing.
    const started = form.workflowDefinitionId
      ? await this.workflow.onDocumentFiled(user, document.id)
      : [];

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_CREATE,
      resourceType: 'Document',
      resourceId: document.id,
      resourceName: document.name,
      metadata: { event: 'form_submitted', form: form.name, submissionId },
    });

    return {
      submissionId,
      documentId: document.id,
      documentName: document.name,
      workflowsStarted: started.length,
    };
  }

  /** What has come in, newest first. */
  async submissions(user: AuthUser, formId: string) {
    await this.get(user, formId);

    const items = await this.db.query(
      `SELECT s.id, s.data, s."createdAt", s."documentId",
              d.name AS "documentName",
              u."displayName" AS "submittedByName", s."submitterEmail"
         FROM form_submissions s
         LEFT JOIN documents d ON d.id = s."documentId"
         LEFT JOIN users u ON u.id = s."submittedById"
        WHERE s."formId" = $1
        ORDER BY s."createdAt" DESC
        LIMIT 200`,
      [formId],
    );
    return { items, total: items.length };
  }
}

/** A field's answer, as it should read on the filed record. */
function format(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
