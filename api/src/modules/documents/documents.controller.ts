import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessLevel } from '../../common/db';
import type { Response } from 'express';
import { CurrentUser, RequireAccess, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { DocumentsService } from './documents.service';
import {
  AddVersionDto,
  ClassifyDocumentDto,
  ListDocumentsDto,
  MoveDocumentDto,
  UploadDocumentDto,
} from './dto/document.dto';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents visible to the caller' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListDocumentsDto) {
    return this.documents.list(user, {
      folderId: query.folderId,
      skip: query.skip,
      take: query.take,
      includeDeleted: query.includeDeleted,
    });
  }

  @Get('recycle-bin')
  @ApiOperation({ summary: 'Deleted documents still inside the recovery window (feature 24)' })
  recycleBin(@CurrentUser() user: AuthUser, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.documents.listRecycleBin(user, {
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENT_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new document (creates version 1)' })
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file) throw new BadRequestException('No file was provided under the "file" field');
    return this.documents.ingest(user, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folderId: dto.folderId ?? null,
      classification: dto.classification,
      description: dto.description,
    });
  }

  @Get(':id')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.READ })
  @ApiOperation({ summary: 'Document detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.findOne(user, id);
  }

  @Get(':id/versions')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.READ })
  @ApiOperation({ summary: 'Version history (feature 12)' })
  versions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.listVersions(user, id);
  }

  @Post(':id/versions')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.WRITE })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new version' })
  addVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AddVersionDto,
  ) {
    if (!file) throw new BadRequestException('No file was provided under the "file" field');
    return this.documents.addVersion(user, id, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      changeSummary: dto.changeSummary,
    });
  }

  @Post(':id/versions/:versionNumber/restore')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.WRITE })
  @ApiOperation({ summary: 'Promote an earlier version back to current' })
  restoreVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
  ) {
    return this.documents.restoreVersion(user, id, versionNumber);
  }

  @Get(':id/content')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.DOWNLOAD })
  @ApiOperation({ summary: 'Stream the document bytes' })
  async content(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
    @Query('version') version?: string,
    @Query('disposition') disposition?: string,
  ) {
    const { stream, filename, mimeType, size } = await this.documents.openContent(
      user,
      id,
      version ? Number(version) : undefined,
    );

    const asAttachment = disposition !== 'inline';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(size));
    res.setHeader(
      'Content-Disposition',
      `${asAttachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    // Never let a shared cache hold on to document bytes.
    res.setHeader('Cache-Control', 'private, no-store');

    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Post(':id/checkout')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.WRITE })
  @ApiOperation({ summary: 'Take an editing lock' })
  checkOut(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.checkOut(user, id);
  }

  @Post(':id/checkin')
  @ApiOperation({ summary: 'Release an editing lock' })
  checkIn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.checkIn(user, id);
  }

  @Delete(':id')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.WRITE })
  @ApiOperation({ summary: 'Soft-delete into the recycle bin' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.softDelete(user, id);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.DOCUMENT_RESTORE)
  @ApiOperation({ summary: 'Recover a deleted document (feature 24)' })
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.restore(user, id);
  }

  @Get(':id/view')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.READ })
  @ApiOperation({
    summary: 'A rendering of the document, for reading on screen (VEW-2)',
    description:
      'Requires READ, not DOWNLOAD. Returns the indexed text rather than the stored bytes, so '
      + 'somebody permitted to read a record on screen can do so without being given the ability '
      + 'to take a copy of it. Says plainly when no rendering exists rather than falling back to '
      + 'the original file.',
  })
  view(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.renderForReading(user, id);
  }

  @Patch(':id/folder')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.WRITE })
  @ApiOperation({
    summary: 'Move a document to another folder (feature 4)',
    description:
      'Needs write on the destination as well as the document. Refused when the destination is '
      + 'more sensitive than the document, because a folder raises the floor for what sits in it '
      + 'and must not silently reclassify what arrives.',
  })
  move(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveDocumentDto) {
    return this.documents.move(user, id, dto.folderId ?? null);
  }

  @Patch(':id/classification')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.WRITE })
  @ApiOperation({
    summary: 'Change a document’s classification (FIL-9)',
    description:
      'Refused when it would drop below the folder the document sits in — otherwise anyone with '
      + 'write access could declassify a record in place and route around the folder’s own '
      + 'restriction.',
  })
  reclassify(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ClassifyDocumentDto,
  ) {
    return this.documents.reclassify(user, id, dto.classification);
  }
}
