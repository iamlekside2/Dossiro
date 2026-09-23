import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';

/**
 * Personnel files (feature 16).
 *
 * Not a store of its own. A personnel file is the set of documents whose type
 * carries a person-kind field pointing at that employee, which means HR reads
 * the same records everybody else does, under the same permissions, the same
 * retention and the same audit. A separate HR table would have needed all
 * three again, and would have been the second place to look for a contract.
 *
 * Completeness is the question this area exists to answer — "whose file is
 * missing something" — and it is computed from the type's own required fields
 * rather than from a checklist maintained beside them. A checklist drifts from
 * the type the first time somebody adds a field.
 */
@Injectable()
export class HrService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Everybody, with how much of their file is present.
   *
   * Counts documents that point at each person through any person-kind field,
   * so a contract naming them as signatory counts towards their file exactly
   * as a personnel record does. That is deliberate: the question is "what do
   * we hold about this person", not "what is in one folder".
   */
  async people(user: AuthUser) {
    const items = await this.db.query(
      `WITH about AS (
         SELECT v."valueUser" AS "userId",
                count(DISTINCT v."documentId") AS documents,
                max(d."updatedAt") AS "lastFiled"
           FROM document_field_values v
           JOIN document_type_fields f ON f.id = v."fieldId" AND f.kind = 'USER'
           JOIN documents d ON d.id = v."documentId" AND d."deletedAt" IS NULL
          WHERE v."organizationId" = $1 AND v."valueUser" IS NOT NULL
          GROUP BY v."valueUser"
       ),
       -- What a complete file looks like: every required field on every
       -- published type that has a person field at all.
       required AS (
         SELECT count(*) AS n
           FROM document_type_fields f
           JOIN document_types t ON t.id = f."documentTypeId"
          WHERE t."organizationId" = $1
            AND t.status = 'PUBLISHED'
            AND f.required = true
            AND EXISTS (
                  SELECT 1 FROM document_type_fields pf
                   WHERE pf."documentTypeId" = t.id AND pf.kind = 'USER')
       )
       SELECT u.id, u."displayName", u.email, u."jobTitle", u.status, u.tier,
              g.name AS "unitName",
              COALESCE(a.documents, 0) AS documents,
              a."lastFiled",
              (SELECT n FROM required) AS "requiredFields"
         FROM users u
         LEFT JOIN about a ON a."userId" = u.id
         LEFT JOIN LATERAL (
              SELECT gr.name
                FROM group_members gm JOIN groups gr ON gr.id = gm."groupId"
               WHERE gm."userId" = u.id
               ORDER BY gr.name ASC LIMIT 1
         ) g ON TRUE
        WHERE u."organizationId" = $1 AND u."deletedAt" IS NULL
        ORDER BY u."displayName" ASC`,
      [user.organizationId],
    );

    return {
      items,
      total: items.length,
      withFiles: items.filter((p) => Number(p.documents) > 0).length,
    };
  }

  /**
   * One person's file: every record that names them, and what is unfilled.
   *
   * The gaps matter more than the documents. "Six files are incomplete" is the
   * only sentence on this screen anybody acts on.
   */
  async file(user: AuthUser, userId: string) {
    const person = await this.db.maybeOne<{ id: string; displayName: string; email: string }>(
      `SELECT id, "displayName", email, "jobTitle", status, "lastLoginAt"
         FROM users WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
      [userId, user.organizationId],
    );
    if (!person) throw new NotFoundException('No such person.');

    const documents = await this.db.query(
      `SELECT DISTINCT d.id, d.name, d.classification, d."updatedAt",
              t.name AS "typeName", f.name AS "fieldName", fo.name AS "folderName"
         FROM document_field_values v
         JOIN document_type_fields f ON f.id = v."fieldId" AND f.kind = 'USER'
         JOIN documents d ON d.id = v."documentId" AND d."deletedAt" IS NULL
         LEFT JOIN document_types t ON t.id = d."documentTypeId"
         LEFT JOIN folders fo ON fo.id = d."folderId"
        WHERE v."valueUser" = $1 AND v."organizationId" = $2
        ORDER BY d."updatedAt" DESC`,
      [userId, user.organizationId],
    );

    // A required field with no value, on a document that is about this person.
    const gaps = await this.db.query(
      `SELECT d.id AS "documentId", d.name AS "documentName",
              t.name AS "typeName", f.name AS "fieldName"
         FROM documents d
         JOIN document_types t ON t.id = d."documentTypeId"
         JOIN document_type_fields f ON f."documentTypeId" = t.id AND f.required = true
         WHERE d."deletedAt" IS NULL
           AND d."organizationId" = $2
           AND EXISTS (
                 SELECT 1 FROM document_field_values pv
                  JOIN document_type_fields pf ON pf.id = pv."fieldId" AND pf.kind = 'USER'
                 WHERE pv."documentId" = d.id AND pv."valueUser" = $1)
           AND NOT EXISTS (
                 SELECT 1 FROM document_field_values v
                  WHERE v."documentId" = d.id AND v."fieldId" = f.id)
         ORDER BY d.name ASC, f.name ASC`,
      [userId, user.organizationId],
    );

    return { person, documents, gaps, complete: gaps.length === 0 };
  }
}
