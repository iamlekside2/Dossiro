import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../common/db';
import { SharesService } from '../shares/shares.service';
import { StorageService } from '../storage/storage.service';
import { ProcessingService } from '../processing/processing.service';
import { WorkflowService } from '../workflow/workflow.service';

/**
 * Scheduled housekeeping.
 *
 * The purge job is the only thing in the system that deletes bytes, and it is
 * written to be conservative: it refuses anything under legal hold, anything
 * still inside its recovery window, and any blob still referenced by another
 * version. Deleting the wrong thing here is unrecoverable.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly shares: SharesService,
    private readonly storage: StorageService,
    private readonly workflow: WorkflowService,
    private readonly processing: ProcessingService,
  ) {}

  /** Closes share links whose time frame has elapsed (feature 1). */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireShares(): Promise<void> {
    const count = await this.shares.expireOverdue();
    if (count > 0) this.logger.log(`Expired ${count} share link(s)`);
  }

  /**
   * Reads whatever has been filed since the last pass.
   *
   * Every minute rather than on upload, so a burst of a hundred documents
   * does not hold a hundred requests open while each one is parsed. Somebody
   * who files a contract sees it searchable within the minute, which is the
   * standard the requirement sets.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async runPipeline(): Promise<void> {
    const { ran, failed } = await this.processing.drain(25);
    if (ran || failed) this.logger.log(`Pipeline: ${ran} read, ${failed} could not be`);
  }

  /**
   * Moves overdue approvals to their named alternative (WFL-6).
   *
   * Hourly rather than nightly: a two-day deadline that escalates at 3am the
   * following morning has already cost most of a working day.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async escalateWorkflows(): Promise<void> {
    const moved = await this.workflow.escalateOverdue();
    if (moved > 0) this.logger.log(`Escalated ${moved} overdue approval(s)`);
  }

  /** Drops refresh sessions that are past their expiry. */
  @Cron(CronExpression.EVERY_HOUR)
  async pruneSessions(): Promise<void> {
    const count = await this.db.execute(`DELETE FROM sessions WHERE "expiresAt" < now()`);
    if (count > 0) this.logger.log(`Pruned ${count} expired session(s)`);
  }

  /**
   * Permanently removes recycle-bin items whose recovery window has passed
   * (feature 24). Runs nightly and logs everything it touches.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredDeletes(): Promise<void> {
    const candidates = await this.db.query<{ id: string; name: string; organizationId: string }>(
      `SELECT d.id, d.name, d."organizationId"
         FROM documents d
        WHERE d."deletedAt" IS NOT NULL
          AND d."purgeAfter" <= now()
          -- Never purge anything frozen for litigation.
          AND NOT EXISTS (
                SELECT 1 FROM legal_holds h
                 WHERE h."documentId" = d.id AND h."releasedAt" IS NULL
              )
        LIMIT 500`,
    );

    if (candidates.length === 0) return;

    for (const doc of candidates) {
      try {
        // restoreVersion() reuses a previous version's storage key, and two
        // uploads of identical bytes may share one too. Only delete a blob
        // once nothing else points at it — the NOT EXISTS does that check in
        // the same query that lists them, so the answer cannot go stale
        // between listing and deleting.
        const orphaned = await this.db.query<{ storageKey: string }>(
          `SELECT DISTINCT v."storageKey"
             FROM document_versions v
            WHERE v."documentId" = $1
              AND NOT EXISTS (
                    SELECT 1 FROM document_versions other
                     WHERE other."storageKey" = v."storageKey"
                       AND other."documentId" <> $1
                  )`,
          [doc.id],
        );

        for (const { storageKey } of orphaned) {
          await this.storage.destroy(storageKey).catch((err) => {
            this.logger.error(`Could not remove blob ${storageKey}`, err as Error);
          });
        }

        await this.db.execute('DELETE FROM documents WHERE id = $1', [doc.id]);
        this.logger.warn(`Purged document ${doc.id} ("${doc.name}") after its recovery window`);
      } catch (err) {
        this.logger.error(`Purge failed for document ${doc.id}`, err as Error);
      }
    }
  }

  /** Clears expired access grants so they stop appearing in review screens. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async pruneExpiredGrants(): Promise<void> {
    const count = await this.db.execute(
      `DELETE FROM access_grants WHERE "expiresAt" IS NOT NULL AND "expiresAt" < now()`,
    );
    if (count > 0) this.logger.log(`Removed ${count} expired access grant(s)`);
  }
}
