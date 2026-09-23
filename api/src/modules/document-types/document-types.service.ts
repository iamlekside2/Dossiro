import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  DatabaseService,
  FieldKind,
  assignments,
  newId,
  type Classification,
  type DocumentTypeStatus,
} from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';
import { WorkflowService } from '../workflow/workflow.service';

export interface TypeInput {
  name: string;
  description?: string;
  keepVersions?: boolean;
  watermarkAll?: boolean;
  retentionPolicyId?: string | null;
  defaultClassification?: Classification;
}

export interface FieldInput {
  name: string;
  description?: string;
  kind?: FieldKind;
  required?: boolean;
  options?: string[];
  position?: number;
  isRetentionAnchor?: boolean;
}

/** Which column a value of each kind lives in. */
const VALUE_COLUMN: Record<FieldKind, string> = {
  TEXT: 'valueText',
  SELECT: 'valueText',
  DATE: 'valueDate',
  NUMBER: 'valueNumber',
  BOOLEAN: 'valueBool',
  USER: 'valueUser',
};

/**
 * User-defined document types (requirements TYP-1 to TYP-7).
 *
 * A type is what a customer calls a kind of record — Contract, Personnel file,
 * Delivery note — and the typed fields it carries are what make those records
 * searchable as data rather than as prose. Everything downstream keys off this:
 * search filters by field, retention anchored to a date the customer chose,
 * workflow triggered by an index value, automatic indexing target.
 *
 * The database enforces the shape (a selection list must have options, one
 * retention anchor per type, exactly one typed value per field). This service
 * does not re-check what the schema already refuses; it translates those
 * refusals into answers an interface can show.
 */
@Injectable()
export class DocumentTypesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
  ) {}

  /* -- Types --------------------------------------------------------------- */

  async list(user: AuthUser, status?: DocumentTypeStatus) {
    const items = await this.db.query(
      `SELECT t.id, t.name, t.description, t.status, t."keepVersions", t."watermarkAll",
              t."defaultClassification", t."retentionPolicyId", t."createdAt",
              CASE WHEN r.id IS NULL THEN NULL
                   ELSE json_build_object('id', r.id, 'name', r.name,
                                          'retainMonths', r."retainMonths",
                                          'action', r.action) END AS retention,
              COALESCE(f.n, 0) AS "fieldCount",
              COALESCE(d.n, 0) AS "inUse"
         FROM document_types t
         LEFT JOIN retention_policies r ON r.id = t."retentionPolicyId"
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM document_type_fields
                             WHERE "documentTypeId" = t.id) f ON TRUE
         -- How many documents carry this type. The figure a customer uses to
         -- decide whether a type is safe to archive, so it counts live
         -- documents only.
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM documents
                             WHERE "documentTypeId" = t.id AND "deletedAt" IS NULL) d ON TRUE
        WHERE t."organizationId" = $1
          AND ($2::"DocumentTypeStatus" IS NULL OR t.status = $2)
        ORDER BY t.name ASC`,
      [user.organizationId, status ?? null],
    );

    return { items, total: items.length };
  }

  /** One type with its fields, in display order. */
  async get(user: AuthUser, id: string) {
    const type = await this.db.maybeOne<{ id: string; name: string } & Record<string, unknown>>(
      `SELECT t.*, CASE WHEN r.id IS NULL THEN NULL
                        ELSE json_build_object('id', r.id, 'name', r.name) END AS retention
         FROM document_types t
         LEFT JOIN retention_policies r ON r.id = t."retentionPolicyId"
        WHERE t.id = $1 AND t."organizationId" = $2`,
      [id, user.organizationId],
    );
    if (!type) throw new NotFoundException('No such document type.');

    const fields = await this.db.query(
      `SELECT id, name, description, kind, required, options, position, "isRetentionAnchor"
         FROM document_type_fields
        WHERE "documentTypeId" = $1
        ORDER BY position ASC, name ASC`,
      [id],
    );

    return { ...type, fields };
  }

  async create(user: AuthUser, input: TypeInput) {
    const id = newId();
    try {
      await this.db.execute(
        `INSERT INTO document_types
           (id, "organizationId", name, description, "keepVersions", "watermarkAll",
            "retentionPolicyId", "defaultClassification", "updatedAt")
         -- The cast is required: COALESCE over an untyped parameter resolves
         -- to text, and Postgres will not assign text to an enum column.
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 COALESCE($8::"Classification", 'INTERNAL'), now())`,
        [
          id,
          user.organizationId,
          input.name.trim(),
          input.description ?? null,
          input.keepVersions ?? true,
          input.watermarkAll ?? false,
          input.retentionPolicyId ?? null,
          input.defaultClassification ?? null,
        ],
      );
    } catch (err) {
      throw this.translate(err, input.name);
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'DocumentType',
      resourceId: id,
      resourceName: input.name,
      metadata: { event: 'Document type created' },
    });

    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, input: Partial<TypeInput>) {
    await this.get(user, id); // 404s before anything is written.

    const set = assignments({
      name: input.name?.trim(),
      description: input.description,
      keepVersions: input.keepVersions,
      watermarkAll: input.watermarkAll,
      retentionPolicyId: input.retentionPolicyId,
      defaultClassification: input.defaultClassification,
    });
    try {
      await this.db.execute(
        `UPDATE document_types SET ${set.text}, "updatedAt" = now()
          WHERE id = $${set.values.length + 1} AND "organizationId" = $${set.values.length + 2}`,
        [...set.values, id, user.organizationId],
      );
    } catch (err) {
      throw this.translate(err, input.name ?? '');
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'DocumentType',
      resourceId: id,
      metadata: { event: 'Document type changed' },
    });

    return this.get(user, id);
  }

  /**
   * Publishing is what makes a type available to file against.
   *
   * A draft with no fields would be a type nobody can fill in, so that is
   * refused here rather than discovered by the first person to use it.
   */
  async setStatus(user: AuthUser, id: string, status: DocumentTypeStatus) {
    const type = await this.get(user, id);

    if (status === 'PUBLISHED' && type.fields.length === 0) {
      throw new BadRequestException(
        'A type needs at least one field before it can be published.',
      );
    }

    await this.db.execute(
      // $1 is cast explicitly because it is used twice — once assigned to the
      // enum column and once compared to a string literal — and Postgres
      // otherwise deduces two different types for the same parameter.
      `UPDATE document_types
          SET status = $1::"DocumentTypeStatus",
              "archivedAt" = CASE WHEN $1::"DocumentTypeStatus" = 'ARCHIVED'
                                  THEN now() ELSE NULL END,
              "updatedAt" = now()
        WHERE id = $2 AND "organizationId" = $3`,
      [status, id, user.organizationId],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'DocumentType',
      resourceId: id,
      resourceName: type.name as string,
      metadata: { event: `Document type ${status.toLowerCase()}` },
    });

    return this.get(user, id);
  }

  /**
   * Deleting a type deletes its fields and every value recorded against them.
   *
   * Refused while documents still carry it: the alternative is silently
   * stripping the index fields off records that were filed correctly, which is
   * data loss dressed as a configuration change. Archive instead.
   */
  async remove(user: AuthUser, id: string) {
    const type = await this.get(user, id);

    const inUse = await this.db.maybeOne<{ n: string }>(
      `SELECT count(*) AS n FROM documents
        WHERE "documentTypeId" = $1 AND "deletedAt" IS NULL`,
      [id],
    );
    if (Number(inUse?.n ?? 0) > 0) {
      throw new ConflictException(
        `${inUse!.n} documents are filed as this type. Archive it instead of deleting it.`,
      );
    }

    await this.db.execute('DELETE FROM document_types WHERE id = $1 AND "organizationId" = $2', [
      id,
      user.organizationId,
    ]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'DocumentType',
      resourceId: id,
      resourceName: type.name as string,
      metadata: { event: 'Document type deleted' },
    });

    return { deleted: true };
  }

  /* -- Fields -------------------------------------------------------------- */

  async addField(user: AuthUser, typeId: string, input: FieldInput) {
    await this.get(user, typeId);

    const kind = input.kind ?? FieldKind.TEXT;
    const id = newId();

    // Appended to the end unless told otherwise. Positions are sparse so a
    // field can later be slotted between two others without renumbering.
    const position =
      input.position ??
      Number(
        (
          await this.db.maybeOne<{ next: string }>(
            `SELECT COALESCE(max(position), 0) + 10 AS next
               FROM document_type_fields WHERE "documentTypeId" = $1`,
            [typeId],
          )
        )?.next ?? 10,
      );

    try {
      await this.db.execute(
        `INSERT INTO document_type_fields
           (id, "organizationId", "documentTypeId", name, description, kind, required,
            options, position, "isRetentionAnchor", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [
          id,
          user.organizationId,
          typeId,
          input.name.trim(),
          input.description ?? null,
          kind,
          input.required ?? false,
          input.options ?? [],
          position,
          input.isRetentionAnchor ?? false,
        ],
      );
    } catch (err) {
      throw this.translate(err, input.name);
    }

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'DocumentType',
      resourceId: typeId,
      metadata: { event: `Field added: ${input.name}` },
    });

    return this.get(user, typeId);
  }

  /**
   * Changing a field's kind is refused once values exist under it.
   *
   * The values live in a column chosen by the kind, so a change would either
   * orphan them or need a conversion that cannot be right for every row —
   * "March" is not a date and "yes, mostly" is not a boolean. Better to refuse
   * and let somebody add a new field than to lose what is already recorded.
   */
  async updateField(user: AuthUser, typeId: string, fieldId: string, input: Partial<FieldInput>) {
    const field = await this.db.maybeOne<{ kind: FieldKind; name: string }>(
      `SELECT kind, name FROM document_type_fields
        WHERE id = $1 AND "documentTypeId" = $2 AND "organizationId" = $3`,
      [fieldId, typeId, user.organizationId],
    );
    if (!field) throw new NotFoundException('No such field on this type.');

    if (input.kind && input.kind !== field.kind) {
      const used = await this.db.maybeOne<{ n: string }>(
        'SELECT count(*) AS n FROM document_field_values WHERE "fieldId" = $1',
        [fieldId],
      );
      if (Number(used?.n ?? 0) > 0) {
        throw new ConflictException(
          `${used!.n} documents already carry a value for this field, so its kind cannot change. `
            + 'Add a new field instead.',
        );
      }
    }

    const set = assignments({
      name: input.name?.trim(),
      description: input.description,
      kind: input.kind,
      required: input.required,
      options: input.options,
      position: input.position,
      isRetentionAnchor: input.isRetentionAnchor,
    });
    try {
      await this.db.execute(
        `UPDATE document_type_fields SET ${set.text}, "updatedAt" = now()
          WHERE id = $${set.values.length + 1}`,
        [...set.values, fieldId],
      );
    } catch (err) {
      throw this.translate(err, input.name ?? field.name);
    }

    return this.get(user, typeId);
  }

  async removeField(user: AuthUser, typeId: string, fieldId: string) {
    await this.get(user, typeId);
    const done = await this.db.execute(
      'DELETE FROM document_type_fields WHERE id = $1 AND "documentTypeId" = $2',
      [fieldId, typeId],
    );
    if (!done) throw new NotFoundException('No such field on this type.');

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'DocumentType',
      resourceId: typeId,
      metadata: { event: 'Field removed' },
    });

    return this.get(user, typeId);
  }


  /* -- Who may file a record as this type ----------------------------------- */

  /**
   * The roles permitted to file as this type, alongside every role that could
   * be chosen.
   *
   * Both halves, because a picker showing only what is already granted cannot
   * be used to grant anything, and a second round trip to fill it in is a
   * round trip for nothing.
   */
  async rolesFor(user: AuthUser, typeId: string) {
    await this.get(user, typeId);

    const rows = await this.db.query<{
      id: string;
      name: string;
      description: string | null;
      allowed: boolean;
    }>(
      `SELECT r.id, r.name, r.description,
              (tr."roleId" IS NOT NULL) AS allowed
         FROM roles r
         LEFT JOIN document_type_roles tr
                ON tr."roleId" = r.id AND tr."documentTypeId" = $1
        WHERE r."organizationId" = $2 OR r."organizationId" IS NULL
        ORDER BY r.name ASC`,
      [typeId, user.organizationId],
    );

    const allowed = rows.filter((r) => r.allowed);
    return {
      // No rows means unrestricted, not forbidden. Stated in the payload so
      // the interface does not have to infer it from an empty list.
      restricted: allowed.length > 0,
      roles: rows,
    };
  }

  /**
   * Replaces the allowlist wholesale.
   *
   * An empty array removes the restriction rather than forbidding everyone —
   * the same meaning the table has, and the only reading that makes "clear
   * this" expressible at all.
   */
  async setRoles(user: AuthUser, typeId: string, roleIds: string[]) {
    const type = await this.get(user, typeId);

    // Roles from another tenant would be a cross-tenant reference, and a role
    // that does not exist would be a restriction nobody could ever satisfy.
    if (roleIds.length) {
      const valid = await this.db.query<{ id: string }>(
        `SELECT id FROM roles
          WHERE id = ANY($1) AND ("organizationId" = $2 OR "organizationId" IS NULL)`,
        [roleIds, user.organizationId],
      );
      if (valid.length !== roleIds.length) {
        throw new BadRequestException('One of those roles does not belong to this organisation.');
      }
    }

    await this.db.transaction(async () => {
      await this.db.execute('DELETE FROM document_type_roles WHERE "documentTypeId" = $1', [typeId]);
      for (const roleId of roleIds) {
        await this.db.execute(
          `INSERT INTO document_type_roles
             ("organizationId", "documentTypeId", "roleId", "grantedById")
           VALUES ($1, $2, $3, $4)`,
          [user.organizationId, typeId, roleId, user.id],
        );
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'DocumentType',
      resourceId: typeId,
      resourceName: type.name as string,
      metadata: {
        event: roleIds.length ? 'type_filing_restricted' : 'type_filing_unrestricted',
        roles: roleIds.length,
      },
    });

    return this.rolesFor(user, typeId);
  }

  /**
   * Whether this person may file a record as this type.
   *
   * Checked against the roles they hold, not their tier: a customer defines
   * roles, and a restriction expressed in terms of our tiers would be
   * meaningless to them.
   */
  private async assertMayFile(user: AuthUser, typeId: string, typeName: string) {
    const restrictions = await this.db.query<{ roleId: string }>(
      'SELECT "roleId" FROM document_type_roles WHERE "documentTypeId" = $1',
      [typeId],
    );
    if (restrictions.length === 0) return; // unrestricted

    const held = await this.db.query<{ n: string }>(
      `SELECT count(*) AS n
         FROM user_roles ur
        WHERE ur."userId" = $1 AND ur."roleId" = ANY($2)`,
      [user.id, restrictions.map((r) => r.roleId)],
    );

    if (Number(held[0]?.n ?? 0) === 0) {
      throw new ForbiddenException(
        `Filing a record as ${typeName} is restricted to particular roles, and you hold none of them.`,
      );
    }
  }

  /* -- Values on a document ------------------------------------------------- */

  /** What one document holds in its type's fields. */
  async valuesFor(user: AuthUser, documentId: string) {
    const rows = await this.db.query(
      `SELECT f.id AS "fieldId", f.name, f.kind, f.required, f.options, f.position,
              f."isRetentionAnchor",
              v."valueText", v."valueDate", v."valueNumber", v."valueBool", v."valueUser",
              v.confidence, v."updatedAt"
         FROM documents d
         JOIN document_type_fields f ON f."documentTypeId" = d."documentTypeId"
         LEFT JOIN document_field_values v
                ON v."documentId" = d.id AND v."fieldId" = f.id
        WHERE d.id = $1 AND d."organizationId" = $2
        ORDER BY f.position ASC, f.name ASC`,
      [documentId, user.organizationId],
    );

    return {
      items: rows.map((r) => ({
        fieldId: r.fieldId,
        name: r.name,
        kind: r.kind,
        required: r.required,
        options: r.options,
        isRetentionAnchor: r.isRetentionAnchor,
        value: this.readValue(r as Record<string, unknown>),
        confidence: r.confidence,
        updatedAt: r.updatedAt,
      })),
    };
  }

  /**
   * Records a value against one field.
   *
   * `null` clears it, which is a delete rather than a row of nulls — the
   * schema refuses a value row with no typed column, and an absent row is the
   * honest representation of "not filled in".
   */
  async setValue(
    user: AuthUser,
    documentId: string,
    fieldId: string,
    value: string | number | boolean | null,
    confidence?: number,
  ) {
    const field = await this.db.maybeOne<{
      kind: FieldKind;
      options: string[];
      name: string;
    } & Record<string, unknown>>(
      `SELECT f.kind, f.options, f.name
         FROM document_type_fields f
         JOIN documents d ON d."documentTypeId" = f."documentTypeId"
        WHERE f.id = $1 AND d.id = $2 AND d."organizationId" = $3`,
      [fieldId, documentId, user.organizationId],
    );
    if (!field) {
      throw new NotFoundException('That field does not belong to this document’s type.');
    }

    if (value === null || value === '') {
      await this.db.execute(
        'DELETE FROM document_field_values WHERE "documentId" = $1 AND "fieldId" = $2',
        [documentId, fieldId],
      );
      return this.valuesFor(user, documentId);
    }

    // A selection list accepts only what it offers. Checked here rather than
    // in the schema because the options can change after the value was set,
    // and an old value should not make the row unreadable.
    // A person from another tenancy would be a cross-tenant reference, and an
    // id that is nobody would be a field pointing at nothing.
    if (field.kind === FieldKind.USER) {
      const person = await this.db.maybeOne<{ id: string }>(
        `SELECT id FROM users
          WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
        [String(value), user.organizationId],
      );
      if (!person) {
        throw new BadRequestException(`${field.name} must name somebody in this organisation.`);
      }
    }

    if (field.kind === FieldKind.SELECT && !field.options.includes(String(value))) {
      throw new BadRequestException(
        `“${value}” is not one of the options for ${field.name}.`,
      );
    }

    // Every value column is sent each time, all but one null, so the upsert
    // can assign each exactly once from EXCLUDED. Setting them to null and
    // then re-assigning the live one is "multiple assignments to same column",
    // which Postgres refuses — and it also keeps the column name out of the
    // SQL string, so nothing is interpolated into a statement.
    //
    // Every column, not most of them: a kind whose column is missing here
    // writes nothing at all, and the row is then refused by the "exactly one
    // value" constraint rather than by anything that names the real problem.
    const coerced = this.coerce(field.kind, value, field.name);
    const column = VALUE_COLUMN[field.kind];
    const cols = {
      valueText: null as unknown,
      valueDate: null as unknown,
      valueNumber: null as unknown,
      valueBool: null as unknown,
      valueUser: null as unknown,
    };
    if (!(column in cols)) {
      throw new BadRequestException(`No column is defined for a ${field.kind} field.`);
    }
    cols[column as keyof typeof cols] = coerced;

    await this.db.execute(
      `INSERT INTO document_field_values
         ("organizationId", "documentId", "fieldId",
          "valueText", "valueDate", "valueNumber", "valueBool", "valueUser",
          "enteredById", confidence, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT ("documentId", "fieldId") DO UPDATE
         SET "valueText"   = EXCLUDED."valueText",
             "valueDate"   = EXCLUDED."valueDate",
             "valueNumber" = EXCLUDED."valueNumber",
             "valueBool"   = EXCLUDED."valueBool",
             "valueUser"   = EXCLUDED."valueUser",
             "enteredById" = EXCLUDED."enteredById",
             confidence    = EXCLUDED.confidence,
             "updatedAt"   = now()`,
      [
        user.organizationId,
        documentId,
        fieldId,
        cols.valueText,
        cols.valueDate,
        cols.valueNumber,
        cols.valueBool,
        cols.valueUser,
        user.id,
        confidence ?? null,
      ],
    );

    return this.valuesFor(user, documentId);
  }

  /** Assigns a document to a type. Clearing it leaves the values orphaned, so they go too. */
  async setDocumentType(user: AuthUser, documentId: string, typeId: string | null) {
    if (typeId) {
      const type = await this.get(user, typeId);
      await this.assertMayFile(user, typeId, type.name as string);
    }

    const done = await this.db.execute(
      'UPDATE documents SET "documentTypeId" = $1, "updatedAt" = now() WHERE id = $2 AND "organizationId" = $3',
      [typeId, documentId, user.organizationId],
    );
    if (!done) throw new NotFoundException('No such document.');

    // Values belong to the old type's fields and mean nothing under the new
    // one. Removing them is the honest outcome; keeping them would leave a
    // contract's expiry date attached to a delivery note.
    await this.db.execute(
      `DELETE FROM document_field_values v
        WHERE v."documentId" = $1
          AND NOT EXISTS (
            SELECT 1 FROM document_type_fields f
             JOIN documents d ON d."documentTypeId" = f."documentTypeId"
            WHERE f.id = v."fieldId" AND d.id = v."documentId")`,
      [documentId],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_UPDATE,
      resourceType: 'Document',
      resourceId: documentId,
      metadata: { event: typeId ? 'Document type set' : 'Document type cleared' },
    });

    // A trigger tests index values, which only exist once the record has a
    // type — so this is the moment a workflow can meaningfully start, not the
    // upload (WFL-1, WFL-2). Never throws into this path.
    if (typeId) await this.workflow.onDocumentFiled(user, documentId);

    return this.valuesFor(user, documentId);
  }

  /* -- Helpers -------------------------------------------------------------- */

  /** The one populated column, as a plain value. */
  private readValue(row: Record<string, unknown>) {
    if (row.valueText !== null && row.valueText !== undefined) return row.valueText;
    if (row.valueDate !== null && row.valueDate !== undefined) return row.valueDate;
    if (row.valueNumber !== null && row.valueNumber !== undefined) return Number(row.valueNumber);
    if (row.valueBool !== null && row.valueBool !== undefined) return row.valueBool;
    if (row.valueUser !== null && row.valueUser !== undefined) return row.valueUser;
    return null;
  }

  private coerce(kind: FieldKind, value: string | number | boolean, name: string) {
    // USER is an id, and it is checked against the tenancy before it is
    // stored — see setValue. Nothing to convert here.
    if (kind === FieldKind.USER) return String(value);
    if (kind === FieldKind.NUMBER) {
      const n = Number(value);
      if (Number.isNaN(n)) throw new BadRequestException(`${name} expects a number.`);
      return n;
    }
    if (kind === FieldKind.DATE) {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`${name} expects a date.`);
      return d;
    }
    if (kind === FieldKind.BOOLEAN) {
      return value === true || value === 'true' || value === 'yes';
    }
    return String(value);
  }

  /**
   * Turns a database refusal into something an interface can show.
   *
   * The schema is the authority on shape, so the checks are not duplicated
   * here — but "violates check constraint document_type_fields_options_match_kind"
   * is not a sentence to put in front of an administrator.
   */
  private translate(err: unknown, name: string): Error {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('document_types_organizationId_name_key')) {
      return new ConflictException(`You already have a document type called “${name}”.`);
    }
    if (message.includes('document_type_fields_documentTypeId_name_key')) {
      return new ConflictException(`This type already has a field called “${name}”.`);
    }
    if (message.includes('document_type_fields_one_anchor_per_type')) {
      return new ConflictException(
        'Another field already drives the retention clock for this type. Clear it first.',
      );
    }
    if (message.includes('document_type_fields_options_match_kind')) {
      return new BadRequestException(
        'A selection list needs at least one option, and no other kind of field may carry options.',
      );
    }
    return err instanceof Error ? err : new Error(message);
  }
}
