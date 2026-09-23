import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessLevel, JobStatus, JobType } from '../../common/db';
import { CurrentUser, RequireAccess } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth.types';
import { ProcessingService } from './processing.service';

/**
 * The document pipeline, as the Ingest screen sees it.
 *
 * Reading the queue is ordinary work — anybody who filed something is entitled
 * to know what happened to it.
 */
@ApiTags('processing')
@Controller('processing')
export class ProcessingController {
  constructor(private readonly processing: ProcessingService) {}

  @Get('queue')
  @ApiOperation({ summary: 'What is on the pipeline, and what became of it' })
  @ApiQuery({ name: 'status', required: false, enum: JobStatus })
  queue(@CurrentUser() user: AuthUser, @Query('status') status?: JobStatus) {
    return this.processing.queue(user, status);
  }

  @Post('jobs/:id/retry')
  @ApiOperation({
    summary: 'Put a failed job back on the queue',
    description:
      'For something that has since been fixed. A job that failed because this deployment cannot '
      + 'read the file will fail again the same way.',
  })
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.processing.retry(user, id);
  }

  @Post('documents/:id/reindex')
  @RequireAccess({ param: 'id', type: 'DOCUMENT', level: AccessLevel.WRITE })
  @ApiOperation({ summary: 'Ask for a document to be read again' })
  reindex(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.processing.enqueue(id, JobType.TEXT_INDEX).then((jobId) => ({ jobId }));
  }
}
