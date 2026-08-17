/**
 * Offline licence enforcement.
 *
 * A licence is a signed statement from Calm Global about what an installation
 * is entitled to. It is verified with an embedded public key and needs no
 * network call, because an on-premise ministry may have no route to the
 * internet at all — and a licence check that fails closed when the link drops
 * is worse than no licence check.
 *
 * The client holds the licence and the database. Both are theirs to edit. That
 * is precisely why entitlement is read from the *signature*, never from a
 * column: `UPDATE organizations SET "seatLimit" = 9999` changes nothing.
 */

export type DeploymentMode = 'hosted' | 'dedicated' | 'onprem';

/** What the licence state means for the running system. */
export type LicenseState =
  /** Signed, bound correctly, in date. */
  | 'active'
  /** Past its end date but inside the grace window. Writes still allowed. */
  | 'grace'
  /** Past grace. Reads continue; new records and new people do not. */
  | 'expired'
  /** Signature failed, or bound to a different installation. */
  | 'invalid'
  /** No licence at all — a fresh install, running on the built-in allowance. */
  | 'unlicensed';

export interface LicensePayload {
  /** Schema version, so old licences keep verifying after the format moves. */
  v: 1;
  /** Licence id. Quoted in support, and the handle for a future revocation list. */
  id: string;
  /** Client name. Shown in the UI so an operator can see what is installed. */
  issuedTo: string;
  mode: DeploymentMode;
  /**
   * What this licence is valid for: an organisation slug in hosted mode, or an
   * installation's deploymentId on-premise. Without binding, one licence could
   * be copied across every ministry in the country.
   */
  boundTo: string;
  /** null means unlimited. */
  seats: number | null;
  /** Optional entitlements, e.g. ["ocr", "ai", "co-editing"]. */
  features: string[];
  issuedAt: string;
  /** null means perpetual. */
  expiresAt: string | null;
  /** Days after expiry during which writes still work. Defaults to 30. */
  graceDays?: number;
}

export interface LicenseStatus {
  state: LicenseState;
  /** Present unless the licence is missing or unverifiable. */
  license: LicensePayload | null;
  /** Seats permitted right now, counting the built-in allowance. */
  seatsAllowed: number | null;
  seatsUsed: number;
  /** May new documents and people be created? */
  writable: boolean;
  /** Human explanation, shown in the UI banner. Empty when nothing is wrong. */
  message: string;
  expiresAt: string | null;
  /** Days remaining before writes stop. Negative once they have. */
  daysRemaining: number | null;
}

/**
 * What an unlicensed installation gets.
 *
 * Deliberately usable rather than crippled: a fresh install must work so
 * somebody can evaluate it, and a production deployment whose licence was
 * never applied must not lock its users out of their own records on day one.
 */
export const UNLICENSED_ALLOWANCE = {
  seats: 5,
  features: [] as string[],
};

export const DEFAULT_GRACE_DAYS = 30;
