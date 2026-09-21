import { useMemo, useState } from 'react';
import {
  LATER, MODELS, STEPS, findModel, inviteLocked, railFor, stepsFor,
} from '../setup/plan.js';
import { useSession } from '../session/SessionContext.jsx';

/**
 * First-run setup: what a tenant administrator completes before their people
 * can sign in.
 *
 * Three columns — a checklist rail, the step being worked on, and an
 * explanation rail carrying the policy behind each step. The explanation rail
 * is not decoration: retention clocks and cache limits are the things people
 * get wrong, and the cost of getting them wrong is paid months later.
 *
 * The delivery model sits above the checklist rather than inside it, because it
 * is not a task — it decides which tasks exist. See `setup/plan.js`.
 *
 * Progress is local state. Persisting it belongs with the settings endpoint and
 * is deliberately not faked here: a tick that survives a reload but not a
 * different browser would be worse than one that plainly does neither.
 */
export default function TenantSetup() {
  const { organization } = useSession();

  const [modelId, setModelId] = useState('managed-custom');
  const [showModels, setShowModels] = useState(false);

  const org = useMemo(
    () => ({
      name: organization?.name ?? 'Your organisation',
      slug: organization?.slug ?? 'your-organisation',
      domain: guessDomain(organization),
    }),
    [organization],
  );

  const steps = useMemo(() => stepsFor(modelId), [modelId]);

  // Which steps are finished. Seeded so the screen shows a tenancy part-way
  // through rather than an empty one, which is the state worth reviewing.
  const [done, setDone] = useState({ domain: true, address: true, identity: true, region: true });

  const [step, setStep] = useState('cabinets');
  const current = steps.includes(step) ? step : steps[0];

  const model = findModel(modelId);
  const locked = inviteLocked(done);
  const remaining = steps.filter((id) => !done[id]).length;

  function choose(id) {
    setShowModels(false);
    setStep(id);
  }

  /** Marks the current step finished and moves to the next unfinished one. */
  function complete(id) {
    const next = { ...done, [id]: true };
    setDone(next);
    const after = steps.find((s) => !next[s] && !(s === 'invite' && inviteLocked(next)));
    if (after) setStep(after);
  }

  function selectModel(id) {
    setModelId(id);
    // A step that existed under the old model may not exist under the new one.
    const kept = stepsFor(id);
    if (!kept.includes(step)) setStep(kept[0]);
  }

  return (
    <div className="setup">
      {/* ---- checklist rail ---- */}
      <aside className="setup__rail">
        <div className="setup__brand">
          <span className="setup__brandmark" />
          <span className="setup__brandname">Dossiro</span>
        </div>

        <div className="setup__org">
          <div className="setup__orgname">{org.name}</div>
          <div className="setup__orgmeta">Setting up · {org.domain}</div>
        </div>

        {/* The delivery model is pinned above the list because it determines
            the list. Presenting it as step one would imply it can be revisited
            as freely as the others, and it cannot once records exist. */}
        <button
          type="button"
          className={`setup__model${showModels ? ' setup__model--open' : ''}`}
          onClick={() => setShowModels((v) => !v)}
        >
          <span className="setup__modeltag">{model.tag}</span>
          <span className="setup__modelname">{model.name}</span>
          <span className="setup__modelmore">{showModels ? 'Close' : 'Review'}</span>
        </button>

        <div className="setup__progress">
          <span className="setup__progresscount">
            {steps.length - remaining} of {steps.length}
          </span>
          <span className="setup__progressbar">
            <span
              className="setup__progressfill"
              style={{ width: `${((steps.length - remaining) / steps.length) * 100}%` }}
            />
          </span>
        </div>

        <ol className="setup__steps">
          {steps.map((id, i) => {
            const isDone = Boolean(done[id]);
            const isLocked = id === 'invite' && locked;
            const state = isDone ? 'done' : isLocked ? 'locked' : id === current ? 'now' : 'todo';
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`setupstep setupstep--${state}${id === current ? ' setupstep--on' : ''}`}
                  onClick={() => choose(id)}
                >
                  <span className="setupstep__box">
                    {isDone ? '✓' : isLocked ? '·' : i + 1}
                  </span>
                  <span className="setupstep__text">
                    <span className="setupstep__title">{STEPS[id].title}</span>
                    <span className="setupstep__note">{summary(id, modelId, org, done)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="setup__later">
          <div className="setup__laterhead">After setup</div>
          {LATER.map(([title, note]) => (
            <div className="setup__lateritem" key={title}>
              <div className="setup__latertitle">{title}</div>
              <div className="setup__laternote">{note}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ---- main panel ---- */}
      <main className="setup__main">
        {locked ? (
          <div className="gate">
            <div className="gate__title">Your people cannot sign in yet</div>
            <div className="gate__body">
              {remaining} of {steps.length} steps remain. Invitations stay held back until roles and
              retention are saved, so that no record arrives before there is somewhere correct to
              put it.
            </div>
          </div>
        ) : null}

        {showModels ? (
          <ModelPanel current={modelId} onPick={selectModel} onClose={() => setShowModels(false)} />
        ) : (
          <StepPanel
            id={current}
            modelId={modelId}
            org={org}
            index={steps.indexOf(current) + 1}
            total={steps.length}
            finished={Boolean(done[current])}
            onComplete={() => complete(current)}
          />
        )}
      </main>

      {/* ---- explanation rail ---- */}
      <aside className="setup__why">
        <div className="setup__whyhead">Worth knowing</div>
        {railFor(showModels ? 'address' : current, modelId).map(([title, text]) => (
          <div className="railnote" key={title}>
            <div className="railnote__title">{title}</div>
            <div className="railnote__text">{text}</div>
          </div>
        ))}
        <p className="setup__whyfoot">
          Setup takes most organisations two or three sessions. You can hand it to a colleague at
          any point, and every change is logged against whoever made it.
        </p>
      </aside>
    </div>
  );
}

/* -- the delivery-model panel --------------------------------------------- */

function ModelPanel({ current, onPick, onClose }) {
  return (
    <section className="panel">
      <div className="panel__eyebrow">Delivery</div>
      <h1 className="panel__title">How Dossiro reaches your people</h1>
      <p className="panel__lede">
        This is normally settled before your tenancy is created, because it decides what the rest of
        setup asks you. It is shown here so you can see which one you are on — and, until your first
        record arrives, change it.
      </p>

      <div className="modelgrid">
        {MODELS.map((m) => (
          <button
            type="button"
            key={m.id}
            className={`modelcard${m.id === current ? ' modelcard--on' : ''}`}
            onClick={() => onPick(m.id)}
          >
            <span className="modelcard__head">
              <span className="modelcard__tag">{m.tag}</span>
              {m.id === current ? <span className="modelcard__on">Current</span> : null}
            </span>
            <span className="modelcard__name">{m.name}</span>
            <span className="modelcard__addr">{m.address}</span>
            <span className="modelcard__blurb">{m.blurb}</span>
          </button>
        ))}
      </div>

      <Callout tone="ochre" title="Changing this changes the steps">
        A managed tenancy chooses a region and is licensed by the platform. One on your own servers
        has no region to choose — your datacentre is the answer — and installs a signed licence
        instead. Steps that do not apply are removed rather than greyed out.
      </Callout>

      <div className="panel__actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Back to setup
        </button>
      </div>
    </section>
  );
}

/* -- step panels ---------------------------------------------------------- */

function StepPanel({ id, modelId, org, index, total, finished, onComplete }) {
  const step = STEPS[id];
  const lede = typeof step.lede === 'function' ? step.lede(modelId, org) : step.lede;

  const Body = BODIES[id];

  return (
    <section className="panel">
      <div className="panel__eyebrow">
        Step {index} of {total}
        {finished ? ' · done' : ''}
      </div>
      <h1 className="panel__title">{step.title}</h1>
      <p className="panel__lede">{lede}</p>

      {Body ? <Body modelId={modelId} org={org} finished={finished} /> : null}

      <div className="panel__actions">
        {finished ? (
          <span className="panel__saved">Saved. Nothing further is needed here.</span>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onComplete}>
            {id === 'invite' ? 'Send the first wave' : 'Save and continue'}
          </button>
        )}
      </div>
    </section>
  );
}

/* ---- step bodies -------------------------------------------------------- */

function DomainBody({ org, finished }) {
  if (finished) {
    return (
      <Facts
        rows={[
          ['Domain', org.domain],
          ['Method', 'DNS TXT record'],
          ['Verified', '4 September 2026, 11:02'],
          ['Re-checked', 'Hourly — last check passed 08:40 today'],
        ]}
        note={`Domain ownership confirmed. Anyone signing in with an ${org.domain} address now resolves to this tenancy.`}
      />
    );
  }
  return (
    <>
      <Field label="Your email domain" hint="The domain your people's work addresses end with.">
        <input className="mfield" defaultValue={org.domain} />
      </Field>
      <div className="codeblock">
        <div className="codeblock__label">Add this TXT record</div>
        <div className="codeblock__row">
          <span className="codeblock__k">Host</span>
          <span className="codeblock__v">_dossiro.{org.domain}</span>
        </div>
        <div className="codeblock__row">
          <span className="codeblock__k">Value</span>
          <span className="codeblock__v">dossiro-verify=8f3a91c47e2b</span>
        </div>
      </div>
      <p className="panel__foot">
        We check every few minutes and hourly thereafter. Public email providers cannot be claimed.
      </p>
    </>
  );
}

function AddressBody({ modelId, org, finished }) {
  if (modelId === 'self-hosted' || modelId === 'air-gapped') {
    const internal = modelId === 'air-gapped';
    return (
      <>
        <Field
          label={internal ? 'Internal hostname' : 'Hostname'}
          hint={
            internal
              ? 'Resolved by your own DNS. Nothing about it is published.'
              : 'Where your people reach your installation.'
          }
        >
          <input className="mfield" defaultValue={internal ? 'dossiro.internal' : `records.${org.domain}`} />
        </Field>
        <Facts
          rows={[
            ['Certificate', 'Yours — including an internal authority'],
            ['DNS', internal ? 'Your internal resolver only' : 'Your own DNS'],
            ['Held by us', internal ? 'Nothing' : 'Only to address invitation emails'],
          ]}
          note={
            internal
              ? 'Because nothing resolves outside your network, external share links cannot work here by design. Sharing is internal only.'
              : 'We store this only so invitation emails and share links point somewhere that works. We never connect to it.'
          }
        />
      </>
    );
  }

  if (finished) {
    return (
      <Facts
        rows={[
          ['Address', `records.${org.domain}`],
          ['Kind', 'Your own domain'],
          ['DNS record', 'CNAME → tenants.dossiro.com, seen 4 September'],
          ['Certificate', 'Issued and renewing automatically'],
          ['Shared alternative', `${org.slug}.dossiro.com, still works`],
          ['Shown before sign-in', `${org.name} name and logo`],
        ]}
        note="Your address is live. Anyone visiting it sees your organisation before they see a password field, which is what stops people signing in to the wrong place."
      />
    );
  }

  return (
    <>
      <Field label="On our domain" hint="Works immediately. Nothing for your IT team to do.">
        <div className="joined">
          <input className="mfield" defaultValue={org.slug} />
          <span className="joined__suffix">.dossiro.com</span>
        </div>
      </Field>
      <Field label="Your own domain" hint="Needs one CNAME record. We issue and renew the certificate.">
        <input className="mfield" defaultValue={`records.${org.domain}`} />
      </Field>
      <p className="panel__foot">Both can be live at once, and either can be added later.</p>
    </>
  );
}

function LicenceBody({ modelId }) {
  return (
    <>
      <div className="drop">
        <div className="drop__title">Drop your licence file here</div>
        <div className="drop__note">A signed <code>.dossirolic</code> file, issued with your contract.</div>
      </div>
      <Facts
        rows={[
          ['Signature', 'Ed25519, verified at every start'],
          ['Seats', 'Read from the signed file, not from the database'],
          ['Connectivity', 'None required, ever'],
          ['On expiry', 'Read-only for 14 days, then sign-in refused'],
          ['Your records', 'Never touched by any licence state'],
        ]}
        note="Entitlement comes from the signature. Raising a seat count directly in the database changes what is stored and not what is allowed."
      />
      {modelId === 'air-gapped' ? (
        <Callout tone="ochre" title="This licence has to travel physically">
          There is no route from this deployment to us, so renewals arrive on media or by hand.
          Begin a month before expiry rather than a week.
        </Callout>
      ) : null}
    </>
  );
}

function IdentityBody({ modelId, finished }) {
  const cloud = modelId !== 'air-gapped';
  if (finished) {
    return (
      <Facts
        rows={[
          ['Provider', 'Microsoft Entra ID'],
          ['Accounts discovered', '248'],
          ['Groups synced', '23'],
          ['Sync frequency', 'Hourly'],
          ['Conditional access', 'Inherited from your tenant policies'],
        ]}
        note="Identity is connected and syncing. Disabling someone in Entra ID removes their access here within the hour."
      />
    );
  }
  return (
    <>
      <div className="choices">
        {(cloud
          ? ['Microsoft Entra ID', 'Okta', 'Active Directory', 'LDAP']
          : ['Active Directory', 'LDAP']
        ).map((name, i) => (
          <button type="button" key={name} className={`choice${i === 0 ? ' choice--on' : ''}`}>
            {name}
          </button>
        ))}
      </div>
      {!cloud ? (
        <p className="panel__foot">
          Cloud providers are not reachable from an air-gapped deployment, so they are not offered.
        </p>
      ) : null}
    </>
  );
}

function RegionBody({ finished }) {
  if (finished) {
    return (
      <Facts
        rows={[
          ['Region', 'ng-lagos-1 (Lagos)'],
          ['Records', 'Stored and processed in Nigeria'],
          ['Backups', 'In country, cross-zone'],
          ['Search index', 'In country'],
          ['Changeable', 'No — fixed at first record'],
        ]}
        note="Residency is set. Records, backups and indexes stay in Nigeria, and no support session can move them out."
      />
    );
  }
  return (
    <>
      <div className="choices choices--stack">
        {[
          ['ng-lagos-1', 'Lagos', 'The default. 112 of 184 tenancies.'],
          ['ng-abuja-1', 'Abuja', 'Second region in Nigeria. 40 tenancies.'],
          ['offshore', 'Outside Nigeria', 'Written request only, with the residency clause struck out.'],
        ].map(([id, name, note], i) => (
          <button type="button" key={id} className={`choice choice--wide${i === 0 ? ' choice--on' : ''}`}>
            <span className="choice__name">{name}</span>
            <span className="choice__code">{id}</span>
            <span className="choice__note">{note}</span>
          </button>
        ))}
      </div>
      <Callout tone="red" title="This cannot be undone">
        The region is fixed the moment your first record arrives — not by you, not by support, not
        by us. Moving records between regions is not a setting.
      </Callout>
    </>
  );
}

const TREE = [
  ['Legal', 0, 'Owner: R. Tan'], ['Contracts', 1, ''], ['2026', 2, ''], ['Vendor', 3, ''],
  ['Employment', 1, ''], ['Litigation', 1, 'Restricted'],
  ['Finance', 0, 'Owner: T. Brennan'], ['Invoices payable', 1, ''], ['Invoices receivable', 1, ''],
  ['Human resources', 0, 'Owner: A. Kalu'], ['Personnel files', 1, 'Passcode'], ['Recruitment', 1, ''],
  ['Operations', 0, 'No owner'], ['Facilities', 1, ''],
  ['Compliance', 0, 'No owner'],
];

function CabinetsBody() {
  const [start, setStart] = useState(0);
  const notes = [
    'Templates cover Legal, Finance, HR and Operations with the retention periods most organisations start from.',
    'We read the folder names on your share and propose a structure from what is actually there — including the folders nobody admits to. You approve it before anything is created.',
    'Nine cabinets is a normal starting point. You can add more once people tell you what is missing.',
  ];
  return (
    <>
      <div className="choices">
        {['Start from a template', 'Import from a file share', 'Build by hand'].map((label, i) => (
          <button
            type="button"
            key={label}
            className={`choice${start === i ? ' choice--on' : ''}`}
            onClick={() => setStart(i)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="panel__foot">{notes[start]}</p>

      <div className="tree">
        <div className="tree__head">Draft structure · 9 cabinets, 2 need an owner</div>
        {TREE.map(([name, depth, tail]) => (
          <div className="tree__row" key={`${name}-${depth}`} style={{ paddingLeft: 13 + depth * 15 }}>
            <span className="tree__name">{name}</span>
            {tail ? (
              <span
                className={
                  tail === 'Restricted'
                    ? 'chip chip--red'
                    : tail === 'Passcode'
                      ? 'chip chip--ochre'
                      : tail === 'No owner'
                        ? 'chip chip--ochre'
                        : 'chip'
                }
              >
                {tail}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <Callout tone="blue" title="Three levels is usually enough">
        Deeper than five is somebody recreating a physical filing cabinet nobody enjoyed using.
      </Callout>
    </>
  );
}

function BrandingBody() {
  const [accent, setAccent] = useState(0);
  const accents = [
    ['Dossiro blue', '#25508C', 'The default. Chosen for legibility against white text at small sizes.'],
    ['Deep green', '#1F6F4A', 'Passes contrast against white.'],
    ['Deep indigo', '#2F3A76', 'Passes contrast against white. Distinct from the blue used for links.'],
    ['Oxblood', '#7A2E33', 'Reads as a warning colour in parts of the interface. Not recommended.'],
  ];
  return (
    <>
      <div className="drop drop--short">
        <div className="drop__title">Drop your logo here</div>
        <div className="drop__note">SVG or PNG. Shown at 19px tall, so simple marks read best.</div>
      </div>

      <div className="fieldlabel">One accent colour</div>
      <div className="choices">
        {accents.map(([label, hex], i) => (
          <button
            type="button"
            key={label}
            className={`choice choice--swatch${accent === i ? ' choice--on' : ''}`}
            onClick={() => setAccent(i)}
          >
            <span className="choice__dot" style={{ background: hex }} />
            {label}
          </button>
        ))}
      </div>
      <p className="panel__foot">{accents[accent][2]}</p>

      <Callout tone="blue" title="Branding is cosmetic by design">
        Logo, accent and the sign-in page only — never layout or terminology. A screenshot from any
        tenancy is still recognisably Dossiro when somebody calls support.
      </Callout>
    </>
  );
}

function RolesBody() {
  return (
    <>
      <Rows
        head={['Your group', 'Role', 'People']}
        rows={[
          ['CG-Records', 'Records manager', '9'],
          ['CG-Legal', 'Approver', '24'],
          ['CG-Finance', 'Contributor', '34'],
          ['CG-All-Staff', 'Reader', '167'],
          ['CG-IT-Admins', 'Administrator', '4'],
        ]}
      />
      <Callout tone="ochre" title="14 people are in no mapped group">
        They can sign in and find an empty repository, which reads as a broken account rather than a
        permission decision. Map them or exclude them before the first wave.
      </Callout>
    </>
  );
}

function RetentionBody() {
  return (
    <>
      <Rows
        head={['Class', 'Basis', 'Keep for', 'Then']}
        rows={[
          ['Contracts', 'Statutory', '7 years after expiry', 'Review queue'],
          ['Invoices', 'CBN requirement', '6 years', 'Review queue'],
          ['Personnel files', 'Employment law', '6 years after leaving', 'Review queue'],
          ['Board papers', 'Companies Act', 'Permanent', 'Never destroyed'],
          ['Correspondence', 'Business need', '3 years', 'Destroy'],
          ['Incident reports', 'Regulatory', '10 years', 'Review queue'],
          ['Delivery notes', 'Business need', '2 years', 'Destroy'],
        ]}
      />
      <Callout tone="red" title="Clocks start at ingest, not when the rule is set">
        A record uploaded today under no rule keeps counting from today. Correcting it later means
        re-dating by hand. This is the step people skip and regret.
      </Callout>
    </>
  );
}

function InviteBody() {
  return (
    <>
      <Rows
        head={['Wave', 'Who', 'People', 'When']}
        rows={[
          ['1', 'Records team', '9', 'On send'],
          ['2', 'Finance and legal', '58', 'Two days later'],
          ['3', 'Operations and HR', '97', 'One week later'],
          ['4', 'Everyone else', '84', 'Two weeks later'],
        ]}
      />
      <Callout tone="blue" title="Waves exist so the first day is survivable">
        The records team finds what is wrong with the cabinet structure while nine people are
        affected, not 248.
      </Callout>
    </>
  );
}

const BODIES = {
  domain: DomainBody,
  address: AddressBody,
  licence: LicenceBody,
  identity: IdentityBody,
  region: RegionBody,
  cabinets: CabinetsBody,
  branding: BrandingBody,
  roles: RolesBody,
  retention: RetentionBody,
  invite: InviteBody,
};

/* -- small pieces --------------------------------------------------------- */

function Facts({ rows, note }) {
  return (
    <div className="facts">
      {rows.map(([k, v]) => (
        <div className="facts__row" key={k}>
          <span className="facts__k">{k}</span>
          <span className="facts__v">{v}</span>
        </div>
      ))}
      {note ? <p className="facts__note">{note}</p> : null}
    </div>
  );
}

function Rows({ head, rows }) {
  return (
    <div className="minitable">
      <div className="minitable__head" style={cols(head.length)}>
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div className="minitable__row" key={r[0]} style={cols(head.length)}>
          {r.map((c, i) => (
            <span key={i} className={i === 0 ? 'minitable__first' : undefined}>
              {c}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function cols(n) {
  return { gridTemplateColumns: n === 3 ? '1fr 150px 80px' : `1fr ${'140px '.repeat(n - 2)}110px` };
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

function Callout({ tone, title, children }) {
  return (
    <div className={`callout callout--${tone}`}>
      <div className="callout__title">{title}</div>
      <div className="callout__body">{children}</div>
    </div>
  );
}

/* -- helpers -------------------------------------------------------------- */

/** The one-line state shown under each step in the rail. */
function summary(id, modelId, org, done) {
  const finished = Boolean(done[id]);
  switch (id) {
    case 'domain':
      return finished ? `${org.domain} · confirmed 4 September` : 'Not verified';
    case 'address':
      if (modelId === 'air-gapped') return finished ? 'dossiro.internal' : 'Internal hostname not set';
      if (modelId === 'self-hosted') return finished ? `records.${org.domain}` : 'Hostname not set';
      return finished ? `records.${org.domain} · certificate issued` : 'Not chosen';
    case 'licence':
      return finished ? 'Installed · 300 seats' : 'No licence installed';
    case 'identity':
      return finished ? 'Microsoft Entra ID · 248 accounts found' : 'Not connected';
    case 'region':
      return finished ? 'ng-lagos-1 · fixed once the first record arrives' : 'Not chosen';
    case 'cabinets':
      return finished ? '9 cabinets' : '9 drafted, 2 need an owner';
    case 'branding':
      return finished ? 'Logo and accent set' : 'Logo and accent not set';
    case 'roles':
      return finished ? '5 roles mapped' : '5 roles, 14 people unmapped';
    case 'retention':
      return finished ? '7 classes set' : 'Nothing set yet';
    case 'invite':
      return inviteLocked(done)
        ? 'Locked until roles and retention are saved'
        : finished
          ? 'First wave sent'
          : '248 people in four waves';
    default:
      return '';
  }
}

/**
 * The email domain, derived from the tenancy's own web address when there is
 * one. A guess, and labelled as an editable field rather than presented as
 * established fact.
 */
function guessDomain(organization) {
  const host = organization?.hostnames?.[0]?.hostname;
  if (host && !host.endsWith('.dossiro.com') && host.includes('.')) {
    return host.split('.').slice(-2).join('.');
  }
  return organization?.slug ? `${organization.slug}.com` : 'your-domain.com';
}
