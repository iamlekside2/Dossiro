import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import type { AppConfig } from '../config/configuration';
import { DatabaseService, UserStatus, newId } from '../db';
import {
  DEFAULT_GRACE_DAYS,
  type LicensePayload,
  type LicenseState,
  type LicenseStatus,
  UNLICENSED_ALLOWANCE,
} from './license.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Verifies subscriptions without a network call.
 *
 * Each tenant subscribes, so the licence normally lives on the organisation.
 * An on-premise installation may instead carry one deployment-wide licence in
 * LICENSE_KEY, covering every organisation in that install — which for an
 * on-premise customer is usually exactly one.
 *
 * Entitlement always comes from the signature. The client owns their database
 * and can set `seatLimit` to anything they like; it changes nothing.
 */
@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private publicKey: ReturnType<typeof createPublicKey> | null = null;
  private deploymentId: string | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<{ app: AppConfig }, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const pem = this.config.get('app', { infer: true }).license.publicKey;
    if (pem) {
      try {
        this.publicKey = createPublicKey(pem.replace(/\\n/g, '\n'));
      } catch (err) {
        this.logger.error(`LICENSE_PUBLIC_KEY is not a valid public key: ${(err as Error).message}`);
      }
    } else {
      this.logger.warn(
        'No LICENSE_PUBLIC_KEY configured. Every installation will run on the unlicensed allowance.',
      );
    }

    await this.ensureInstallation();
  }

  /**
   * This deployment's identity, generated once. An on-premise licence is bound
   * to it, so a licence issued to one ministry cannot be copied to another.
   */
  private async ensureInstallation(): Promise<void> {
    const existing = await this.db.maybeOne<{ deploymentId: string }>(
      'SELECT "deploymentId" FROM installation LIMIT 1',
    );
    if (existing) {
      this.deploymentId = existing.deploymentId;
      return;
    }

    // A partial unique index makes this table a singleton, so two workers
    // starting at once cannot register two identities for one deployment.
    // ON CONFLICT turns the loser's insert into a read instead of a crash.
    const inserted = await this.db.maybeOne<{ deploymentId: string }>(
      `INSERT INTO installation (id, "deploymentId", mode)
            VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
         RETURNING "deploymentId"`,
      [newId(), `ds-${randomUUID()}`, this.config.get('app', { infer: true }).deploymentMode],
    );

    // No row back means another worker won the race; read theirs.
    const created =
      inserted ??
      (await this.db.one<{ deploymentId: string }>(
        'SELECT "deploymentId" FROM installation LIMIT 1',
      ));

    this.deploymentId = created.deploymentId;
    this.logger.log(`Installation registered as ${created.deploymentId}`);
  }

  getDeploymentId(): string | null {
    return this.deploymentId;
  }

  /**
   * Checks the signature and returns the payload, or null.
   *
   * Ed25519: the signature covers the exact payload bytes, so any edit to
   * seats or expiry invalidates it. Only Calm holds the private key.
   */
  verify(token: string | null | undefined): LicensePayload | null {
    if (!token || !this.publicKey) return null;

    const [body, sig] = token.trim().split('.');
    if (!body || !sig) return null;

    try {
      const ok = verifySignature(
        null,
        Buffer.from(body, 'base64url'),
        this.publicKey,
        Buffer.from(sig, 'base64url'),
      );
      if (!ok) return null;

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LicensePayload;
      return payload.v === 1 ? payload : null;
    } catch {
      return null;
    }
  }

  /**
   * Entitlement for one tenant: its own licence, else the deployment licence.
   */
  async statusFor(organizationId: string): Promise<LicenseStatus> {
    const org = await this.db.maybeOne<{ slug: string; licenseKey: string | null; name: string }>(
      'SELECT slug, "licenseKey", name FROM organizations WHERE id = $1',
      [organizationId],
    );

    const seatsUsed = await this.db.count(
      `SELECT count(*) FROM users
         WHERE "organizationId" = $1
           AND "deletedAt" IS NULL
           AND status = ANY($2::"UserStatus"[])`,
      [organizationId, [UserStatus.ACTIVE, UserStatus.INVITED]],
    );

    const tenantLicense = this.verify(org?.licenseKey);
    const deploymentLicense = this.verify(this.config.get('app', { infer: true }).license.key);
    const license = tenantLicense ?? deploymentLicense;

    if (!license) {
      return this.unlicensed(seatsUsed, org?.licenseKey ? 'invalid' : 'unlicensed');
    }

    // Binding: a tenant licence names the organisation, a deployment licence
    // names the installation. A licence that verifies but was issued to someone
    // else is treated as absent, not as valid.
    const boundCorrectly =
      license === tenantLicense
        ? license.boundTo === org?.slug
        : license.boundTo === this.deploymentId;

    if (!boundCorrectly) {
      this.logger.warn(
        `Licence ${license.id} is bound to "${license.boundTo}" but presented for "${org?.slug ?? this.deploymentId}".`,
      );
      return this.unlicensed(seatsUsed, 'invalid');
    }

    const { state, daysRemaining } = this.evaluate(license);
    const writable = state === 'active' || state === 'grace';

    return {
      state,
      license,
      seatsAllowed: license.seats,
      seatsUsed,
      writable,
      expiresAt: license.expiresAt,
      daysRemaining,
      message: this.explain(state, license, daysRemaining),
    };
  }

  private evaluate(license: LicensePayload): { state: LicenseState; daysRemaining: number | null } {
    if (!license.expiresAt) return { state: 'active', daysRemaining: null };

    const expiry = new Date(license.expiresAt).getTime();
    const grace = (license.graceDays ?? DEFAULT_GRACE_DAYS) * DAY_MS;
    const now = Date.now();

    if (now <= expiry) {
      return { state: 'active', daysRemaining: Math.ceil((expiry - now) / DAY_MS) };
    }
    if (now <= expiry + grace) {
      return { state: 'grace', daysRemaining: Math.ceil((expiry + grace - now) / DAY_MS) };
    }
    return { state: 'expired', daysRemaining: -Math.floor((now - expiry - grace) / DAY_MS) };
  }

  private unlicensed(seatsUsed: number, state: LicenseState): LicenseStatus {
    return {
      state,
      license: null,
      seatsAllowed: UNLICENSED_ALLOWANCE.seats,
      seatsUsed,
      // An unlicensed install still works. Somebody has to be able to evaluate
      // it, and a deployment whose licence was never applied must not lock its
      // users out of their own records on the first morning.
      writable: true,
      expiresAt: null,
      daysRemaining: null,
      message:
        state === 'invalid'
          ? 'This licence could not be verified. Running on the free allowance until it is replaced.'
          : `No subscription applied. Running on the free allowance of ${UNLICENSED_ALLOWANCE.seats} people.`,
    };
  }

  private explain(state: LicenseState, license: LicensePayload, days: number | null): string {
    if (state === 'active') {
      return days !== null && days <= 30
        ? `Subscription for ${license.issuedTo} renews in ${days} day${days === 1 ? '' : 's'}.`
        : '';
    }
    if (state === 'grace') {
      return `Subscription expired. ${days} day${days === 1 ? '' : 's'} of grace remain before new records and new people are blocked.`;
    }
    return 'Subscription expired. Existing records remain readable and downloadable; adding new records or people is paused until it is renewed.';
  }

  // ---------------------------------------------------------------------------
  // Enforcement
  // ---------------------------------------------------------------------------

  /**
   * Called where a seat is consumed — inviting or reinstating someone.
   *
   * Never on sign-in: locking out people who already have accounts because a
   * renewal is late would be a hostage-taking, not a licence check.
   */
  async assertSeatAvailable(organizationId: string): Promise<void> {
    const status = await this.statusFor(organizationId);

    if (!status.writable) {
      throw new ForbiddenException(status.message);
    }
    if (status.seatsAllowed === null) return;

    if (status.seatsUsed >= status.seatsAllowed) {
      throw new ForbiddenException(
        status.license
          ? `All ${status.seatsAllowed} seats on this subscription are in use. Suspend someone who has left, or add seats.`
          : `The free allowance of ${status.seatsAllowed} people is in use. Apply a subscription to add more.`,
      );
    }
  }

  /** Called where a new record is created. Reads are never gated. */
  async assertWritable(organizationId: string): Promise<void> {
    const status = await this.statusFor(organizationId);
    if (!status.writable) throw new ForbiddenException(status.message);
  }

  async hasFeature(organizationId: string, feature: string): Promise<boolean> {
    const status = await this.statusFor(organizationId);
    return status.license?.features.includes(feature) ?? false;
  }
}
