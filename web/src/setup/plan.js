/**
 * What a tenant has to do before their people can sign in.
 *
 * The handoff designs one path — a managed tenancy on the customer's own
 * domain — and notes in passing that "self-hosted skips this". That is not
 * enough to build from, because the delivery model changes more than one step:
 * a self-hosted tenancy has no region to choose (their datacentre is the
 * answer) but does have a licence to install, and an air-gapped one cannot
 * verify a domain over the internet at all.
 *
 * So the step list is derived from the model rather than fixed at nine. A step
 * that does not apply is absent, not shown greyed out — the same principle the
 * repository uses for records you cannot reach. Somebody setting up an
 * air-gapped ministry should not be looking at a region picker they will never
 * use, wondering whether they have missed something.
 */

/* -- Delivery models ------------------------------------------------------ */

export const MODELS = [
  {
    id: 'managed-shared',
    name: 'On our platform',
    address: 'An address we provide',
    blurb:
      'The fastest way to start. Your tenancy runs on our managed platform at an address like '
      + 'acme.dossiro.com, live immediately, with nothing for your IT team to do.',
    /** Shown in the step rail so the person always knows which path they are on. */
    tag: 'Managed',
  },
  {
    id: 'managed-custom',
    name: 'On our platform, at your own address',
    address: 'Your own domain',
    blurb:
      'The same managed platform, reached at an address that is yours — records.acme.com. One '
      + 'DNS record from your IT team; we issue and renew the certificate.',
    tag: 'Managed',
  },
  {
    id: 'self-hosted',
    name: 'On your own servers',
    address: 'Your hostname, your certificate',
    blurb:
      'Dossiro runs in your datacentre or your own cloud account. Your records never leave your '
      + 'infrastructure, and you hold the keys. You install a signed licence and apply updates on '
      + 'your own schedule.',
    tag: 'Self-hosted',
  },
  {
    id: 'air-gapped',
    name: 'On your own servers, with no internet',
    address: 'Internal hostname only',
    blurb:
      'For deployments that cannot reach the internet at all. Everything works offline, including '
      + 'licensing; updates and diagnostics travel physically. Chosen by ministries and defence.',
    tag: 'Air-gapped',
  },
];

export function findModel(id) {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

/* -- Steps ---------------------------------------------------------------- */

/**
 * Every step that can exist, in the order they are worked through. Which of
 * them actually apply is decided by `stepsFor`.
 */
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
 * Why each step is or is not needed, per model.
 *
 * Written as a predicate per step rather than a list per model so that adding a
 * fifth delivery model means answering ten questions, not copying a list and
 * hoping nothing was missed.
 */
const APPLIES = {
  // Proves the customer controls the email domain, which is what lets somebody
  // typing their work address resolve to this tenancy. An air-gapped
  // deployment serves exactly one organisation, so there is nothing to resolve
  // between and no way to check a DNS record anyway.
  domain: (m) => m !== 'air-gapped',

  // Every model has an address; what differs is who owns it and who issues the
  // certificate. Handled inside the step rather than by skipping it.
  address: () => true,

  // Entitlement has to be enforced without contacting us (PLT-4), so anything
  // running on the customer's own hardware carries a signed licence file.
  // Managed tenancies are licensed by the platform itself.
  licence: (m) => m === 'self-hosted' || m === 'air-gapped',

  identity: () => true,

  // Only meaningful when we are the ones holding the records. On the
  // customer's own servers the answer is "your datacentre" and there is no
  // choice to present.
  region: (m) => m === 'managed-shared' || m === 'managed-custom',

  cabinets: () => true,
  branding: () => true,
  roles: () => true,
  retention: () => true,
  invite: () => true,
};

export function stepsFor(modelId) {
  return ORDER.filter((id) => APPLIES[id](modelId));
}

/* -- Step content --------------------------------------------------------- */

/**
 * Title, one-line summary for the rail, and the panel's opening paragraph.
 *
 * Where the copy differs by model it is a function of the model; where it does
 * not, it is a string. Keeping both in one place means the self-hosted wording
 * cannot quietly drift away from the managed wording.
 */
export const STEPS = {
  domain: {
    title: 'Verify your domain',
    lede: (m, org) =>
      m === 'self-hosted'
        ? `Proves you control ${org.domain}. Your people sign in with their work address, and this `
          + 'is what tells Dossiro those addresses are yours.'
        : `Proves you control ${org.domain}, so nobody else can claim your people.`,
  },

  address: {
    title: 'Choose your address',
    lede: (m) => {
      if (m === 'managed-shared') {
        return 'Your people reach Dossiro at an address that is yours, not a shared one with a '
          + 'customer number in it. The address identifies your organisation before anyone signs '
          + 'in — your name and your branding, on a page nobody has to be told is the right one.';
      }
      if (m === 'managed-custom') {
        return 'The address is yours and lives on your own domain. It identifies your organisation '
          + 'before anyone signs in, and the certificate is ours to issue and renew so there is no '
          + 'annual scramble.';
      }
      if (m === 'self-hosted') {
        return 'Dossiro runs on your infrastructure, so the address and the certificate are both '
          + 'yours. Tell us what it is only so that invitation emails and share links point at the '
          + 'right place.';
      }
      return 'An internal hostname your people can reach without leaving your network. Nothing '
        + 'resolves publicly, and no certificate authority is contacted.';
    },
  },

  licence: {
    title: 'Install your licence',
    lede: () =>
      'Your licence is a signed file. Dossiro verifies it at every start and reads your seat count '
      + 'from the signature, so it works with no connection to us — and editing the database does '
      + 'not change what you are entitled to.',
  },

  identity: {
    title: 'Connect identity',
    lede: (m) =>
      m === 'air-gapped'
        ? 'Dossiro never holds a password. Your directory authenticates, and group membership '
          + 'drives access. Cloud providers are not reachable from this deployment, so this is '
          + 'Active Directory or LDAP on your own network.'
        : 'Dossiro never holds a password. Your identity provider authenticates, and group '
          + 'membership drives access.',
  },

  region: {
    title: 'Choose where records live',
    lede: () =>
      'Records, backups and search indexes all stay in one region. This cannot be changed once the '
      + 'first record arrives.',
  },

  cabinets: {
    title: 'Build your cabinets',
    lede: () =>
      'Cabinets are the only thing that decides who can reach what. Everything else — search, '
      + 'classification, automatic naming — works across all of them, so this structure is about '
      + 'access and retention, not about finding things.',
  },

  branding: {
    title: 'Make it yours',
    lede: () =>
      'Your logo and one accent colour, set here and applied everywhere — the sign-in page, the '
      + 'workbench, and every share link an outsider opens. Nobody needs to involve us to change '
      + 'it later.',
  },

  roles: {
    title: 'Define roles',
    lede: (m) =>
      m === 'air-gapped'
        ? 'Your directory groups already exist. Map them to roles here rather than rebuilding your '
          + 'org chart — when somebody changes team, their access follows.'
        : 'Your groups already exist in your identity provider. Map them to roles here rather than '
          + 'rebuilding your org chart — when somebody changes team, their access follows without '
          + 'anyone touching Dossiro.',
  },

  retention: {
    title: 'Set retention and holds',
    lede: () =>
      'How long each class of record is kept, and what happens at the end. Set this before anyone '
      + 'uploads.',
  },

  invite: {
    title: 'Invite your people',
    lede: () =>
      'The last step, and the one that opens the doors. Until you send the first wave, only '
      + 'administrators can sign in.',
  },
};

/* -- The explanation rail ------------------------------------------------- */

/**
 * "Worth knowing" notes beside each step.
 *
 * These carry real policy — retention clocks, cache limits, escalation paths —
 * and the handoff is explicit that they are part of the design rather than
 * decoration. Model-specific notes come first where they exist, because the
 * thing somebody most needs to know about a self-hosted licence is not the
 * same as for a managed one.
 */
export const RAIL = {
  domain: {
    all: [
      ['One record, then hourly',
       'A single DNS TXT record proves it. We re-check hourly afterwards, so a domain that lapses '
       + 'does not quietly keep working.'],
      ['This is not sign-in',
       'Verifying the domain decides which tenancy an address belongs to. Whether somebody may '
       + 'sign in is decided by your identity provider, in the next step but one.'],
    ],
  },

  address: {
    'managed-shared': [
      ['Nothing for IT to do',
       'An address on dossiro.com works the moment you pick it. No DNS record, no certificate, no '
       + 'waiting on a change window.'],
      ['You can move later',
       'Adding your own domain afterwards is one DNS record, and both addresses keep working. '
       + 'Nobody has to re-learn a URL on a Monday morning.'],
    ],
    'managed-custom': [
      ['Your domain or ours',
       'Your own address needs one DNS record from your IT team. The address on dossiro.com needs '
       + 'nothing and works immediately — both can be live at once.'],
      ['The certificate is ours to manage',
       'Issued and renewed automatically. No annual scramble, no expired-certificate warning in '
       + 'front of your own staff.'],
    ],
    'self-hosted': [
      ['We never see this address',
       'It is on your network and resolved by your DNS. We hold it only so that invitation emails '
       + 'and share links point somewhere that works.'],
      ['The certificate is yours',
       'Use whatever your organisation already uses, including an internal authority. Dossiro does '
       + 'not care who signed it.'],
    ],
    'air-gapped': [
      ['Nothing resolves publicly',
       'The hostname exists only inside your network. No certificate authority is contacted and no '
       + 'DNS query leaves the building.'],
      ['Share links need a decision',
       'External sharing assumes a recipient outside your network can reach the address. On an '
       + 'air-gapped deployment that is deliberately impossible, so sharing is internal only.'],
    ],
  },

  licence: {
    all: [
      ['It works with no connection',
       'The licence is verified from its signature at every start. Nothing is phoned home, which is '
       + 'why it works in a datacentre with no outbound route.'],
      ['Editing the database does nothing',
       'Seat counts are read from the signed file, not from a table. Raising a number in Postgres '
       + 'changes what is stored and not what is allowed.'],
      ['Expiry degrades, it does not delete',
       'An expired licence drops to read-only for fourteen days, then refuses sign-in. Your records '
       + 'are never touched, and installing a new licence restores everything.'],
    ],
    'air-gapped': [
      ['Plan the renewal early',
       'A licence for an air-gapped deployment has to travel physically. Start the renewal a month '
       + 'before expiry, not a week.'],
    ],
  },

  identity: {
    all: [
      ['No password to steal',
       'Dossiro never stores one. There is nothing in our database that would help anybody who took '
       + 'a copy of it.'],
      ['Sync runs hourly',
       'Somebody disabled in your directory loses access here within the hour, without anyone '
       + 'remembering to do it twice.'],
      ['Groups, not people',
       'Map groups to roles. Mapping individuals works and then rots the first time somebody '
       + 'changes team.'],
    ],
  },

  region: {
    all: [
      ['Fixed at the first record',
       'Not changeable afterwards by you, by support, or by us. Moving records between regions is '
       + 'not a setting, and pretending otherwise would be the kind of promise that fails at the '
       + 'worst moment.'],
      ['Lagos unless you say otherwise',
       'Records, backups and indexes all stay in Nigeria. An offshore region needs a written '
       + 'request with the residency clause struck out.'],
      ['Support cannot move them',
       'There is no operator action that relocates a tenancy. The constraint is in the platform, '
       + 'not in a policy document.'],
    ],
  },

  cabinets: {
    all: [
      ['Start from your file share',
       'Point Dossiro at an existing share and it proposes a structure from what is actually there, '
       + 'rather than what a policy document says should be there.'],
      ['An owner is not optional',
       'An owner approves access requests and answers retention questions. Without one, requests '
       + 'queue against nobody.'],
      ['Restricted is not the same as private',
       'A restricted cabinet is invisible in listings — people cannot see that the records exist. '
       + 'Use it for litigation and investigations, not for merely sensitive material.'],
      ['You can change this later',
       'Moving a cabinet moves its records and their permissions together, and the move is logged. '
       + 'It is inconvenient, not dangerous.'],
    ],
  },

  branding: {
    all: [
      ['Cosmetic by design',
       'Logo, accent and the sign-in page. Never layout or terminology, so a screenshot from any '
       + 'tenancy is still recognisably Dossiro when somebody calls support.'],
      ['Contrast is checked',
       'An accent that fails against white text is refused rather than warned about.'],
    ],
  },

  roles: {
    all: [
      ['Five roles is usually right',
       'Reader, contributor, approver, records manager, administrator. More than eight and nobody '
       + 'remembers which is which.'],
      ['Nobody can alter the audit trail',
       'Not an administrator, not an owner, not us. It is not a permission that exists to grant.'],
      ['Unmapped people see nothing',
       'They can sign in and find an empty repository, which reads as a broken account rather than '
       + 'a permission decision. It generates support tickets on day one.'],
    ],
  },

  retention: {
    all: [
      ['Clocks start at ingest',
       'Not at classification, not at approval. A record uploaded today under no rule keeps '
       + 'counting from today, and correcting it later means re-dating by hand.'],
      ['Destruction is a queue, not an event',
       'When a period ends the record enters a review queue. The records manager confirms, and that '
       + 'confirmation is logged.'],
      ['Holds outrank everything',
       'A held record survives its retention period, an administrator, and offboarding.'],
      ['Defaults are a starting point',
       'These follow common statutory periods. Your counsel should confirm them before launch, not '
       + 'after.'],
    ],
  },

  invite: {
    all: [
      ['Waves, not a big bang',
       'Records team, then finance, then everyone. Each wave surfaces problems while they are still '
       + 'cheap.'],
      ['The invitation explains itself',
       'People receive what Dossiro is for, what has moved, and where their own files now live — '
       + 'not a bare login link.'],
      ['Nothing is deleted anywhere else',
       'Your file share stays readable during the transition. Cutting it off is a separate '
       + 'decision, months later.'],
      ['Day one support',
       'Your onboarding contact joins the first wave day in a shared channel.'],
    ],
  },
};

/** Rail notes for a step under a model: the model's own first, then the common ones. */
export function railFor(stepId, modelId) {
  const entry = RAIL[stepId] ?? {};
  return [...(entry[modelId] ?? []), ...(entry.all ?? [])];
}

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
