/**
 * What a tenant has to do before their people can sign in.
 *
 * The delivery model decides which steps exist. A managed tenancy chooses a
 * region and is licensed by the platform; one on the customer's own servers has
 * no region to choose — their datacentre is the answer — and installs a signed
 * licence instead; an air-gapped one additionally cannot verify a domain over
 * the internet at all.
 *
 * A step that does not apply is absent rather than greyed out, matching how the
 * repository treats records you cannot reach. Somebody configuring an air-gapped
 * ministry should not be looking at a region picker they will never use and
 * wondering what they have missed.
 *
 * Copy comes from the design handoff, parameterised on the tenancy rather than
 * carrying its sample organisation.
 */

/* -- Delivery models ------------------------------------------------------ */

/**
 * Three, deliberately.
 *
 * Whether a managed customer uses their own domain is a question inside setup —
 * "Choose your address" is already a step — not a fourth way of running
 * Dossiro. Splitting managed into shared-address and custom-address variants
 * would put the same decision in two places.
 */
export const MODELS = [
  {
    id: 'managed',
    tag: 'Managed',
    name: 'On our platform',
    address: 'Our address or yours — you choose at step 2',
    blurb:
      'We run it. Your tenancy is live immediately with nothing for your IT team to do, and we '
      + 'hold the keys, issue the certificates and apply updates. The overwhelming majority of '
      + 'customers are here.',
    steps: 'Nine steps. No licence file. 166 of 184 customers.',
  },
  {
    id: 'self-hosted',
    tag: 'Self-hosted',
    name: 'On your own servers',
    address: 'Your hostname, your certificate',
    blurb:
      'Dossiro runs in your datacentre or your own cloud account. Your records never leave your '
      + 'infrastructure and you hold the keys. You install a signed licence and apply updates on '
      + 'your own schedule.',
    steps: 'Nine steps. Adds a licence, drops the region question.',
  },
  {
    id: 'air-gapped',
    tag: 'Air-gapped',
    name: 'On your own servers, with no internet',
    address: 'Internal hostname only',
    blurb:
      'For deployments that cannot reach the internet at all. Everything works offline, including '
      + 'licensing; updates and diagnostics travel physically. Chosen by ministries and defence.',
    steps: 'Eight steps. No domain verification, no region, directory sign-in.',
  },
];

export function findModel(id) {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

/** True for anything running on the customer's own hardware. */
const onTheirIron = (m) => m === 'self-hosted' || m === 'air-gapped';
const airGapped = (m) => m === 'air-gapped';

/** The address their people actually reach, used in the branding preview. */
export function addressFor(modelId, org) {
  if (modelId === 'air-gapped') return 'dossiro.internal';
  return `records.${org.domain}`;
}

/* -- Steps ---------------------------------------------------------------- */

const ORDER = [
  'domain',
  'address',
  'licence',
  'identity',
  'region',
  'cabinets',
  'branding',
  'roles',
  'retention',
  'invite',
];

/**
 * Whether each step applies, as a predicate per step rather than a list per
 * model — so adding a fourth model means answering ten questions instead of
 * copying a list and hoping nothing was missed.
 */
const APPLIES = {
  // Proves the customer controls the email domain, which is what lets somebody
  // typing their work address resolve to this tenancy. An air-gapped
  // deployment serves one organisation, so there is nothing to resolve between
  // — and no way to check a DNS record anyway.
  domain: (m) => !airGapped(m),

  // Every model has an address. What differs is who owns it and who issues the
  // certificate, which is handled inside the step.
  address: () => true,

  // Entitlement has to be enforced with no outbound connectivity (PLT-4), so
  // anything on the customer's own hardware carries a signed licence. Managed
  // tenancies are licensed by the platform itself.
  licence: onTheirIron,

  identity: () => true,

  // Only meaningful when we hold the records. On their own servers the answer
  // is "your datacentre" and there is no choice to present.
  region: (m) => !onTheirIron(m),

  cabinets: () => true,
  branding: () => true,
  roles: () => true,
  retention: () => true,
  invite: () => true,
};

export function stepsFor(modelId) {
  return ORDER.filter((id) => APPLIES[id](modelId));
}

/* -- Step copy ------------------------------------------------------------ */

export const TITLES = {
  domain: 'Verify your domain',
  address: 'Choose your address',
  licence: 'Install your licence',
  identity: 'Connect identity',
  region: 'Choose where records live',
  cabinets: 'Build your cabinets',
  branding: 'Make it yours',
  roles: 'Define roles',
  retention: 'Set retention and holds',
  invite: 'Invite your people',
};

export const LEDE = {
  domain: (m, org) =>
    m === 'self-hosted'
      ? `Proves you control ${org.domain}. Your people sign in with their work address, and this `
        + 'is what tells your deployment those addresses are yours.'
      : `Proves you control ${org.domain}, so nobody else can claim your people.`,

  address: (m) => {
    if (m === 'managed') {
      return 'Whichever you choose, the certificate is ours to issue and renew, and the page '
        + 'identifies your organisation before anyone signs in. Both addresses can be live at '
        + 'once, so this is not a decision you can get wrong.';
    }
    if (m === 'self-hosted') {
      return 'You own the address and the certificate, because you own the server. We never see '
        + 'traffic to it, which also means we cannot tell you when it breaks.';
    }
    return 'An internal hostname, resolvable only inside your network. Nothing about this address '
      + 'is visible to us or to the internet, and no public certificate authority is involved.';
  },

  licence: (m) =>
    airGapped(m)
      ? 'Your deployment cannot reach us, so it cannot ask us what it is entitled to. It carries a '
        + 'signed licence file instead and enforces its own limits with no network at all.'
      : 'Your deployment enforces its own entitlement without contacting us. The licence is a '
        + 'signed file you install; nothing phones home, on your schedule or ours.',

  identity: (m) =>
    airGapped(m)
      ? 'No cloud identity provider is reachable, so you authenticate against the directory you '
        + 'already run inside the network — Active Directory or LDAP.'
      : 'Dossiro never holds a password. Your provider authenticates, and group membership drives '
        + 'access.',

  region: () =>
    'Records, backups and search indexes all stay in one region. This cannot be changed once the '
    + 'first record arrives.',

  cabinets: () =>
    'Cabinets are the only thing that decides who can reach what. Everything else — search, '
    + 'classification, automatic naming — works across all of them, so this structure is about '
    + 'access and retention, not about finding things.',

  branding: () =>
    'Your logo and one accent colour, set here and applied everywhere — the sign-in page, the '
    + 'workbench, and every share link an outsider opens. Nobody needs to involve us to change it '
    + 'later.',

  roles: (m) =>
    airGapped(m)
      ? 'Your directory groups already exist. Map them to roles here rather than rebuilding your '
        + 'org chart — when somebody changes team, their access follows.'
      : 'Your groups already exist in your identity provider. Map them to roles here rather than '
        + 'rebuilding your org chart — when somebody changes team, their access follows without '
        + 'anyone touching Dossiro.',

  retention: () =>
    'How long each class of record is kept, and what happens at the end. Set this before anyone '
    + 'uploads.',

  invite: () =>
    'The last step, and the one that opens the doors. Until you send the first wave, only '
    + 'administrators can sign in.',
};

/* -- The explanation rail ------------------------------------------------- */

/**
 * "Worth knowing" notes beside each step, plus a distinct set for the model
 * chooser.
 *
 * These carry real policy — retention clocks, certificate expiry, escalation
 * paths — and the handoff is explicit that they are part of the design rather
 * than decoration. Where a note has to cover more than one delivery model it
 * says so in its own text, which reads better than three near-identical notes.
 */
export const RAIL = {
  model: [
    ['The decision behind the decisions',
     'Where Dossiro runs determines who holds your records, who issues your certificate, how you '
     + 'are licensed, and who can help when something breaks. It is not a preference.'],
    ['You can move later, once',
     'Managed to self-hosted is an export and a fresh install. Self-hosted to managed is the same '
     + 'in reverse. Neither is a switch, and both need a planned weekend.'],
    ['Most organisations choose managed',
     'Of 184 customers, 166 run on our platform. The 18 who do not are banks and ministries with a '
     + 'regulator naming the requirement in writing.'],
    ['Your address is not your model',
     'Whether you use your own domain is a question inside setup, not a different way of running '
     + 'Dossiro. It changes one DNS record, nothing else.'],
  ],

  domain: [
    ['Why this comes first',
     'Domain ownership is what stops someone else creating a tenancy that claims your people.'],
    ['Verified by DNS',
     'A TXT record, checked hourly. Removing it does not revoke anything, but we will tell you.'],
  ],

  address: [
    ['Your domain or ours',
     'Your own address needs one DNS record from your IT team. The address on dossiro.com needs '
     + 'nothing and works immediately. Both can be live at once, which is why this is a step and '
     + 'not a delivery model.'],
    ['The certificate follows the model',
     'On our platform it is ours to issue and renew. On your servers it is yours, and so is the '
     + 'expiry date.'],
    ['It is what people see first',
     'The address identifies your organisation before anyone types a password, which is most of '
     + 'what stops a convincing phishing page.'],
  ],

  licence: [
    ['Entitlement without a network',
     'The deployment verifies a signed file at every start. Nothing contacts us, which is the only '
     + 'way an air-gapped ministry can be licensed honestly.'],
    ['It cannot be raised by editing data',
     'Seat counts live in the signature, not in a table. This is deliberate and it is checked.'],
    ['Expiry degrades, it does not delete',
     'Fourteen days read-only, then sign-in stops. Your records stay exactly where they are, and a '
     + 'new licence restores access immediately.'],
    ['Renewal is a date in your calendar',
     'On air-gapped deployments the file has to physically reach you. Two weeks of margin is not '
     + 'much margin.'],
  ],

  identity: [
    ['No password lives here',
     'Your provider authenticates. Dossiro receives who somebody is and which groups they belong '
     + 'to, nothing more.'],
    ['Conditional access still applies',
     'Your device compliance and location rules govern Dossiro exactly as they govern everything '
     + 'else.'],
  ],

  region: [
    ['Nigeria by default',
     'Lagos is the default and satisfies NDPA residency without a special arrangement. Abuja is '
     + 'available, and an offshore region only on written request.'],
    ['This one is permanent',
     'Region is fixed once the first record arrives. Moving later means an export and a new '
     + 'tenancy.'],
    ['Backups stay too',
     'Backups and search indexes never leave the region. Support staff cannot pull a record into '
     + 'another one.'],
  ],

  cabinets: [
    ['Start from your file share',
     'Point Dossiro at an existing share and it proposes a structure from what is actually there, '
     + 'rather than what a policy document says should be there.'],
    ['Two cabinets have no owner',
     'An owner approves access requests and answers retention questions. Without one, requests '
     + 'queue against nobody.'],
    ['Restricted is not the same as private',
     'A restricted cabinet is invisible in listings — people cannot see that the records exist. '
     + 'Use it for litigation and investigations, not for merely sensitive material.'],
    ['You can change this later',
     'Moving a cabinet moves its records and their permissions together, and the move is logged. '
     + 'It is inconvenient, not dangerous.'],
  ],

  branding: [
    ['One accent, not a theme',
     'A logo and a single colour. Dossiro deliberately does not let you restyle the whole '
     + 'interface — a familiar shape matters more than a matched palette.'],
    ['It reaches outsiders too',
     'A counterparty opening a share link sees your logo, not ours. That is often the first '
     + 'impression your brand makes in a negotiation.'],
    ['Change it whenever',
     'No ticket, no involvement from us. Changes apply at the next page load for everyone.'],
    ['Contrast is checked',
     'If an accent fails legibility against white text, we will say so rather than let it ship.'],
  ],

  roles: [
    ['Five roles is usually right',
     'Reader, contributor, approver, records manager, administrator. More than eight and nobody '
     + 'remembers which is which.'],
    ['Nobody can alter the audit trail',
     'Not an administrator, not an owner, not us. It is not a permission that exists to grant.'],
    ['Group sync runs hourly',
     'Leavers lose access within the hour of being disabled, without anyone remembering to do it '
     + 'here.'],
    ['The 14 unmapped people',
     'They can sign in and see an empty repository. That generates support tickets on day one.'],
  ],

  retention: [
    ['Clocks start at ingest',
     'Not at classification, not at approval. A record uploaded today under no rule keeps counting '
     + 'from today.'],
    ['Destruction is a queue, not an event',
     'When a period ends the record enters a review queue. The records manager confirms, and that '
     + 'confirmation is logged.'],
    ['Holds outrank everything',
     'A held record survives its retention period, an administrator, and offboarding.'],
    ['Defaults are a starting point',
     'These follow common statutory periods. Your counsel should confirm them before launch, not '
     + 'after.'],
  ],

  invite: [
    ['Waves, not a big bang',
     'Records team, then finance, then everyone. Each wave surfaces problems while they are still '
     + 'cheap.'],
    ['The invitation explains itself',
     'People receive what Dossiro is for, what has moved, and where their own files now live — not '
     + 'a bare login link.'],
    ['Nothing is deleted anywhere else',
     'Your file share stays readable during the transition. Cutting it off is a separate decision, '
     + 'months later.'],
    ['Day one support',
     'Your onboarding contact joins the first wave day in a shared channel.'],
  ],
};

/* -- What comes after setup ----------------------------------------------- */

export const LATER = [
  ['Connect capture devices', 'Scanners, mailboxes, watched folders, WhatsApp intake.'],
  ['Turn on integrations', 'Microsoft 365, SharePoint, Adobe, Dynamics.'],
  ['Build e-forms', 'Replace the paper forms people still print.'],
  ['Tune classification', 'The model learns your naming from the first few hundred records.'],
];

/* -- Gate ----------------------------------------------------------------- */

/**
 * Invitations are held back until roles and retention are saved.
 *
 * Deliberate, and the reason is worth stating plainly: retention clocks start
 * when a record arrives, so a record filed before there is a rule to catch it
 * keeps counting from the wrong date and has to be corrected by hand. Letting
 * people in first is the mistake that is expensive to undo.
 */
export const INVITE_REQUIRES = ['roles', 'retention'];

export function inviteLocked(done) {
  return INVITE_REQUIRES.some((id) => !done[id]);
}
