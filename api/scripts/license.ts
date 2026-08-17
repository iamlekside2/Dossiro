/**
 * Licence tooling for Calm Global.
 *
 *   npx tsx scripts/license.ts keypair
 *   npx tsx scripts/license.ts issue --to "Lagos State Ministry of Justice" \
 *       --bound-to lagos-state-ministry-of-justice --seats 25 --months 12
 *   npx tsx scripts/license.ts inspect <token>
 *
 * The private key signs every subscription Calm sells. It belongs in a password
 * manager or a KMS — not in this repository, not in the deployment, and not in
 * a chat message. Anyone holding it can mint unlimited free licences.
 */
import { generateKeyPairSync, sign as signPayload, createPublicKey, verify } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type Mode = 'hosted' | 'dedicated' | 'onprem';

const KEY_DIR = path.resolve(process.cwd(), '.keys');
const PRIVATE_PATH = path.join(KEY_DIR, 'license-signing.key');

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function keypair(): void {
  // Ed25519: 32-byte keys, 64-byte signatures, no parameter choices to get
  // wrong. RSA would work but produces licence strings too long to paste.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  if (existsSync(PRIVATE_PATH)) {
    console.error(
      `Refusing to overwrite ${PRIVATE_PATH}.\n` +
        'Replacing the signing key invalidates every licence already issued. ' +
        'Move the existing key aside deliberately if that is really what you want.',
    );
    process.exit(1);
  }

  writeFileSync(PRIVATE_PATH, priv, { mode: 0o600 });

  console.log('Signing key written to .keys/license-signing.key (gitignored).');
  console.log('Back it up somewhere safe. Losing it means re-issuing every licence.\n');
  console.log('Put this in the API environment of every deployment:\n');
  console.log(`LICENSE_PUBLIC_KEY="${pub.trimEnd().replace(/\n/g, '\\n')}"\n`);
}

function issue(): void {
  if (!existsSync(PRIVATE_PATH)) {
    console.error('No signing key. Run:  npx tsx scripts/license.ts keypair');
    process.exit(1);
  }

  const issuedTo = arg('to');
  const boundTo = arg('bound-to');
  if (!issuedTo || !boundTo) {
    console.error(
      'Usage: issue --to "<client name>" --bound-to <org-slug|deploymentId> ' +
        '[--seats N] [--months N] [--mode hosted|dedicated|onprem] [--features a,b]',
    );
    process.exit(1);
  }

  const seatsRaw = arg('seats');
  const months = Number(arg('months', '12'));
  const graceDays = Number(arg('grace', '30'));

  // 0 means perpetual. A negative value backdates the expiry, which is how you
  // produce an already-expired licence to test the grace and expiry paths —
  // `months > 0` would have silently turned that into a perpetual licence.
  const expiresAt =
    months === 0 ? null : new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();

  const payload = {
    v: 1 as const,
    id: `lic_${Date.now().toString(36)}`,
    issuedTo,
    mode: (arg('mode', 'hosted') as Mode),
    boundTo,
    seats: seatsRaw ? Number(seatsRaw) : null,
    features: (arg('features', '') ?? '').split(',').map((f) => f.trim()).filter(Boolean),
    issuedAt: new Date().toISOString(),
    expiresAt,
    graceDays,
  };

  const privateKey = readFileSync(PRIVATE_PATH, 'utf8');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(null, Buffer.from(body, 'base64url'), privateKey).toString('base64url');
  const token = `${body}.${signature}`;

  console.log(`\nLicence for ${issuedTo}`);
  console.log(`  bound to   ${payload.boundTo}   (${payload.mode})`);
  console.log(`  seats      ${payload.seats ?? 'unlimited'}`);
  console.log(`  expires    ${payload.expiresAt ?? 'never'}${expiresAt ? ` (+${graceDays} days grace)` : ''}`);
  if (payload.features.length) console.log(`  features   ${payload.features.join(', ')}`);
  console.log(`\n${token}\n`);
  console.log('Hosted: PATCH /api/platform/organizations/<id>/license');
  console.log('On-premise: set LICENSE_KEY in the deployment environment.\n');
}

function inspect(): void {
  const token = process.argv[3];
  if (!token) {
    console.error('Usage: inspect <token>');
    process.exit(1);
  }

  const [body, sig] = token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  console.log(JSON.stringify(payload, null, 2));

  if (existsSync(PRIVATE_PATH)) {
    const pub = createPublicKey(readFileSync(PRIVATE_PATH, 'utf8'));
    const ok = verify(null, Buffer.from(body, 'base64url'), pub, Buffer.from(sig, 'base64url'));
    console.log(`\nSignature: ${ok ? 'valid' : 'INVALID'}`);
  }
}

const command = process.argv[2];
if (command === 'keypair') keypair();
else if (command === 'issue') issue();
else if (command === 'inspect') inspect();
else {
  console.error('Commands: keypair | issue | inspect');
  process.exit(1);
}
