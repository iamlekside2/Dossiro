import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessLevel, AuditAction, ResourceType } from '../../common/db';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { DatabaseService, newId } from '../../common/db';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';
import { AccessService } from './access.service';
import { CreateGrantDto } from './dto/grant.dto';

@ApiTags('access')
@Controller('access')
export class AccessController {
  constructor(
    private readonly access: AccessService,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Get('effective')
  @ApiOperation({ summary: 'Resolve the calling user’s effective level on a resource' })
  async effective(
    @CurrentUser() user: AuthUser,
    @Query('type') type: ResourceType,
    @Query('id') id: string,
  ) {
    const level =
      type === ResourceType.DOCUMENT
        ? await this.access.getDocumentAccess(user, id)
        : await this.access.getFolderAccess(user, id);
    return { resourceType: type, resourceId: id, level };
  }

  @Get('grants')
  @RequirePermissions(PERMISSIONS.ACCESS_GRANT)
  @ApiOperation({ summary: 'List grants attached to a folder or document' })
  async list(@CurrentUser() user: AuthUser, @Query('folderId') folderId?: string, @Query('documentId') documentId?: string) {
    if (!folderId && !documentId) throw new BadRequestException('Provide folderId or documentId');

    // Confirm the caller may see the resource before listing who else can.
    if (folderId) await this.access.assertFolder(user, folderId, AccessLevel.MANAGE);
    if (documentId) await this.access.assertDocument(user, documentId, AccessLevel.MANAGE);

    return this.db.query(
      `SELECT g.*,
              CASE WHEN u.id IS NULL THEN NULL ELSE
                json_build_object('id', u.id, 'displayName', u."displayName", 'email', u.email) END AS "user",
              CASE WHEN gr.id IS NULL THEN NULL ELSE
                json_build_object('id', gr.id, 'name', gr.name) END AS "group",
              CASE WHEN r.id IS NULL THEN NULL ELSE
                json_build_object('id', r.id, 'name', r.name) END AS role
         FROM access_grants g
         LEFT JOIN users u   ON u.id  = g."userId"
         LEFT JOIN groups gr ON gr.id = g."groupId"
         LEFT JOIN roles r   ON r.id  = g."roleId"
        WHERE ($1::text IS NULL OR g."folderId"   = $1)
          AND ($2::text IS NULL OR g."documentId" = $2)
        ORDER BY g."createdAt" DESC`,
      [folderId ?? null, documentId ?? null],
    );
  }

  @Post('grants')
  @RequirePermissions(PERMISSIONS.ACCESS_GRANT)
  @ApiOperation({ summary: 'Grant access to a user, group or role (features 8, 13)' })
  async grant(@CurrentUser() user: AuthUser, @Body() dto: CreateGrantDto) {
    // You may only hand out access to something you administer yourself.
    if (dto.resourceType === ResourceType.FOLDER) {
      if (!dto.folderId) throw new BadRequestException('folderId is required');
      await this.access.assertFolder(user, dto.folderId, AccessLevel.MANAGE);
    } else {
      if (!dto.documentId) throw new BadRequestException('documentId is required');
      await this.access.assertDocument(user, dto.documentId, AccessLevel.MANAGE);
    }

    // And never more than you hold. Without this an editor could promote
    // themselves via a second account.
    const own =
      dto.resourceType === ResourceType.FOLDER
        ? await this.access.getFolderAccess(user, dto.folderId!)
        : await this.access.getDocumentAccess(user, dto.documentId!);

    if (dto.level === AccessLevel.OWNER && own !== AccessLevel.OWNER) {
      throw new BadRequestException('You cannot grant OWNER access that you do not hold');
    }

    const grant = await this.db.one<{ id: string }>(
      `INSERT INTO access_grants
              (id, "subjectType", "userId", "groupId", "roleId", "branchId",
               "resourceType", "folderId", "documentId", level, "isDeny",
               "expiresAt", "grantedById", "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
         RETURNING *`,
      [
        newId(),
        dto.subjectType,
        dto.userId ?? null,
        dto.groupId ?? null,
        dto.roleId ?? null,
        dto.branchId ?? null,
        dto.resourceType,
        dto.folderId ?? null,
        dto.documentId ?? null,
        dto.level,
        dto.isDeny ?? false,
        dto.expiresAt ?? null,
        user.id,
      ],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.ACCESS_GRANT,
      resourceType: dto.resourceType,
      resourceId: dto.folderId ?? dto.documentId,
      metadata: {
        grantId: grant.id,
        level: dto.level,
        isDeny: dto.isDeny ?? false,
        subject: dto.userId ?? dto.groupId ?? dto.roleId ?? dto.branchId,
        subjectType: dto.subjectType,
      },
    });

    return grant;
  }

  @Delete('grants/:id')
  @RequirePermissions(PERMISSIONS.ACCESS_GRANT)
  @ApiOperation({ summary: 'Revoke a grant' })
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const grant = await this.db.maybeOne<{
      id: string;
      folderId: string | null;
      documentId: string | null;
      resourceType: ResourceType;
      level: AccessLevel;
    }>('SELECT * FROM access_grants WHERE id = $1', [id]);
    if (!grant) throw new BadRequestException('Grant not found');

    if (grant.folderId) await this.access.assertFolder(user, grant.folderId, AccessLevel.MANAGE);
    if (grant.documentId) await this.access.assertDocument(user, grant.documentId, AccessLevel.MANAGE);

    await this.db.execute('DELETE FROM access_grants WHERE id = $1', [id]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.ACCESS_REVOKE,
      resourceType: grant.resourceType,
      resourceId: grant.folderId ?? grant.documentId,
      metadata: { grantId: id, level: grant.level },
    });

    return { revoked: true };
  }
}
