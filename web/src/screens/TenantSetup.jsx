import { useMemo, useState } from 'react';
import {
  LATER, LEDE, MODELS, RAIL, TITLES, addressFor, findModel, inviteLocked, stepsFor,
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

  const [modelId, setModelId] = useState('managed');
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
    // Keep where they were if that step still exists under the new model;
    // otherwise go to the first thing still outstanding rather than back to the
    // top, which would hide the work already done behind two finished steps.
    const kept = stepsFor(id);
    if (!kept.includes(step)) setStep(kept.find((s) => !done[s]) ?? kept[0]);
  }

  return (
    // Wide enough for three columns: the rails hold still and only the step
    // scrolls, so the checklist stays reachable from the bottom of a long step.
    // Below that the columns stack and the page scrolls normally.
    <div className="flex min-h-screen items-stretch bg-surface-3 max-mid:flex-col mid:h-screen mid:overflow-hidden">
      {/* ---- checklist rail ---- */}
      <aside className="flex w-setuprail shrink-0 flex-col border-r border-line bg-surface-2 max-mid:w-full max-mid:border-r-0 max-mid:border-b mid:overflow-y-auto">
        <div className="flex items-center gap-[9px] border-b border-line-soft p-4">
          <span className="h-4 w-4 bg-blue" />
          <span className="text-body font-bold tracking-[-0.01em]">Dossiro</span>
        </div>

        <div className="border-b border-line-soft px-4 py-[14px]">
          <div className="text-row font-semibold">{org.name}</div>
          <div className="mt-0.5 text-meta text-dim">Setting up · {org.domain}</div>
        </div>

        {/* Pinned above the list because it determines the list, and in ink so
            it reads as the frame around setup rather than the first task in it.
            Presenting it as step one would imply it can be revisited as freely
            as the others, and it cannot once records exist. */}
        <button
          type="button"
          onClick={() => setShowModels((v) => !v)}
          className={`block w-full cursor-pointer px-4 py-3 text-left text-white hover:bg-ink-2 ${
            showModels ? 'bg-ink-2' : 'bg-ink'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-blue-on-dark">
            {model.tag}
          </span>
          <span className="mt-0.5 block text-ui font-semibold">{model.name}</span>
          <span className="mt-0.5 block text-chip leading-[1.4] text-ghost">{model.address}</span>
          <span className="mt-[5px] block text-chip font-semibold text-blue-on-dark">
            {showModels ? 'Close' : 'Review'}
          </span>
        </button>

        <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
          <span className="whitespace-nowrap text-chip font-semibold text-muted">
            {steps.length - remaining} of {steps.length}
          </span>
          <span className="h-1 flex-1 bg-line-soft">
            <span
              className="block h-full bg-green"
              style={{ width: `${((steps.length - remaining) / steps.length) * 100}%` }}
            />
          </span>
        </div>

        <ol className="flex-1">
          {steps.map((id, i) => {
            const isDone = Boolean(done[id]);
            const isLocked = id === 'invite' && locked;
            const on = id === current;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => choose(id)}
                  className={`flex w-full cursor-pointer items-start gap-3 border-b border-line-faint px-4 py-[11px] text-left ${
                    on ? 'bg-blue-tint' : 'hover:bg-row-hover'
                  }`}
                >
                  <span
                    className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center font-bold ${
                      isDone
                        ? 'border border-green bg-green text-meta text-white'
                        : isLocked
                          ? 'border border-line-strong bg-neutral-bg text-[11px] text-ghost'
                          : on
                            ? 'border-2 border-blue bg-surface text-[11px] text-blue'
                            : 'border border-line-strong bg-surface text-[11px] text-dim'
                    }`}
                  >
                    {isDone ? '✓' : isLocked ? '·' : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-row ${on ? 'font-bold' : 'font-medium'} ${
                        isLocked ? 'text-dim' : ''
                      }`}
                    >
                      {TITLES[id]}
                    </span>
                    <span className="mt-0.5 block text-chip leading-[1.4] text-dim">
                      {summary(id, modelId, org, done)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="border-t border-line px-4 pb-5 pt-[14px]">
          <div className="mb-[9px] text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
            After setup
          </div>
          {LATER.map(([title, note]) => (
            <div className="mb-[9px]" key={title}>
              <div className="text-detail font-semibold text-muted">{title}</div>
              <div className="text-chip leading-[1.4] text-dim">{note}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ---- main panel ---- */}
      <main className="min-w-0 flex-1 overflow-y-auto px-8 pb-14 pt-7 max-mid:px-[18px] max-mid:pb-12 max-mid:pt-5">
        {locked ? (
          <div className="mb-[22px] max-w-[720px] border border-ochre-border bg-ochre-bg px-[14px] py-3">
            <div className="mb-[3px] text-row font-bold text-ochre">
              Your people cannot sign in yet
            </div>
            <div className="text-detail leading-[1.55] text-ochre">
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

      {/* ---- explanation rail ----

          Dropped below the fold rather than squeezed: these notes are policy,
          and policy at four words a line is not readable. */}
      <aside className="w-whyrail shrink-0 border-l border-line bg-surface-2 px-6 py-7 max-wide:hidden mid:overflow-y-auto">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">
          Worth knowing
        </div>
        {RAIL[showModels ? 'model' : current].map(([title, text]) => (
          <div className="border-b border-line-soft py-[14px]" key={title}>
            <div className="text-ui font-semibold">{title}</div>
            <div className="text-detail leading-[1.6] text-muted">{text}</div>
          </div>
        ))}
        <p className="mt-[18px] text-meta leading-[1.55] text-dim">
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
    <section className="max-w-[720px]">
      <Eyebrow>Delivery</Eyebrow>
      <Title>How Dossiro reaches your people</Title>
      <Lede>
        This is normally settled before your tenancy is created, because it decides what the rest of
        setup asks you. It is shown here so you can see which one you are on — and, until your first
        record arrives, change it.
      </Lede>
      <Lede>
        Whether you use your own domain is <em>not</em> one of these. That is a question inside
        setup, at step two, and both addresses can be live at once.
      </Lede>

      <div className="grid grid-cols-2 gap-3 max-mid:grid-cols-1">
        {MODELS.map((m) => {
          const on = m.id === current;
          return (
            <button
              type="button"
              key={m.id}
              onClick={() => onPick(m.id)}
              // Border thickens on selection; padding compensates so nothing shifts.
              className={`block cursor-pointer bg-surface text-left hover:bg-blue-bg ${
                on ? 'border-2 border-ink p-[13px]' : 'border border-line-strong p-[14px]'
              }`}
            >
              <span className="mb-[5px] flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-blue">
                  {m.tag}
                </span>
                {on ? <span className="text-[10.5px] font-bold text-green">Current</span> : null}
              </span>
              <span className="mb-0.5 block text-body font-semibold">{m.name}</span>
              <span className="mb-[7px] block text-meta text-dim">{m.address}</span>
              <span className="block text-detail leading-[1.55] text-muted">{m.blurb}</span>
              <span className="mt-2 block border-t border-line-soft pt-2 text-chip font-semibold text-dim">
                {m.steps}
              </span>
            </button>
          );
        })}
      </div>

      <Callout tone="ochre" title="Changing this changes the steps">
        A managed tenancy chooses a region and is licensed by the platform. One on your own servers
        has no region to choose — your datacentre is the answer — and installs a signed licence
        instead. Steps that do not apply are removed rather than greyed out.
      </Callout>

      <Actions>
        <PrimaryButton onClick={onClose}>Back to setup</PrimaryButton>
      </Actions>
    </section>
  );
}

/* -- step panels ---------------------------------------------------------- */

function StepPanel({ id, modelId, org, index, total, finished, onComplete }) {
  const Body = BODIES[id];

  return (
    <section className="max-w-[720px]">
      <Eyebrow>
        Step {index} of {total}
        {finished ? ' · done' : ''}
      </Eyebrow>
      <Title>{TITLES[id]}</Title>
      <Lede>{LEDE[id](modelId, org)}</Lede>

      {Body ? <Body modelId={modelId} org={org} finished={finished} /> : null}

      <Actions>
        {finished ? (
          <span className="text-detail text-dim">Saved. Nothing further is needed here.</span>
        ) : (
          <PrimaryButton onClick={onComplete}>
            {id === 'invite' ? 'Send the first wave' : 'Save and continue'}
          </PrimaryButton>
        )}
      </Actions>
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
        <Input defaultValue={org.domain} />
      </Field>
      <div className="mt-1.5 border border-line bg-surface">
        <PanelHead>Add this TXT record</PanelHead>
        <div className="grid grid-cols-[70px_1fr] gap-[14px] border-b border-line-faint px-[14px] py-2 text-ui">
          <span className="text-dim">Host</span>
          <span className="break-all font-mono text-detail">_dossiro.{org.domain}</span>
        </div>
        <div className="grid grid-cols-[70px_1fr] gap-[14px] px-[14px] py-2 text-ui">
          <span className="text-dim">Value</span>
          <span className="break-all font-mono text-detail">dossiro-verify=8f3a91c47e2b</span>
        </div>
      </div>
      <Foot>
        We check every few minutes and hourly thereafter. Public email providers cannot be claimed.
      </Foot>
    </>
  );
}

function AddressBody({ modelId, org, finished }) {
  if (modelId === 'self-hosted') {
    return (
      <>
        <Field label="Hostname" hint="Where your people reach your installation.">
          <Input defaultValue={`records.${org.domain}`} />
        </Field>
        <Facts
          rows={[
            ['Kind', 'Yours entirely'],
            ['DNS', 'Your record, pointing at your server'],
            ['Certificate', 'Yours to issue and renew'],
            ['Reachable from', 'Wherever you allow'],
            ['Our visibility', 'None'],
          ]}
        />
        <Callout tone="ochre" title="The expiry is yours too">
          Because the certificate is yours, its expiry is yours. An expired certificate locks your
          own people out and we will not know it happened. Put the renewal date somewhere it will
          be seen.
        </Callout>
      </>
    );
  }

  if (modelId === 'air-gapped') {
    return (
      <>
        <Field
          label="Internal hostname"
          hint="Resolved by your own DNS. Nothing about it is published."
        >
          <Input defaultValue="dossiro.internal" />
        </Field>
        <Facts
          rows={[
            ['Kind', 'Internal only'],
            ['DNS', 'Your internal resolver'],
            ['Certificate', 'Yours, including an internal authority'],
            ['Reachable from', 'Inside your network only'],
            ['Our visibility', 'None'],
          ]}
        />
        <Callout tone="red" title="Nothing about this deployment is reachable by us">
          No support session, no monitoring, no automatic update. Everything travels physically,
          and the diagnostic route in your runbook is the only way we can help.
        </Callout>
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
          ['Also live', `${org.slug}.dossiro.com, always works`],
          ['Shown before sign-in', `${org.name} name and logo`],
        ]}
        note="Your address is live. Anyone visiting it sees your organisation before they see a password field, which is what stops people signing in to the wrong place — and the shared address keeps working, so no bookmark breaks."
      />
    );
  }

  return (
    <>
      <Field label="On our domain" hint="Works immediately. Nothing for your IT team to do.">
        <div className="flex items-stretch">
          <Input defaultValue={org.slug} />
          <span className="flex items-center whitespace-nowrap border border-l-0 border-line-strong bg-surface-3 px-[11px] text-ui text-dim">
            .dossiro.com
          </span>
        </div>
      </Field>
      <Field label="Your own domain" hint="Needs one CNAME record. We issue and renew the certificate.">
        <Input defaultValue={`records.${org.domain}`} />
      </Field>
      <Foot>Both can be live at once, and either can be added later.</Foot>
    </>
  );
}

function LicenceBody({ modelId }) {
  return (
    <>
      <div className="border border-dashed border-line-strong bg-surface px-[18px] py-[26px] text-center">
        <div className="mb-[3px] text-row font-semibold">Drop your licence file here</div>
        <div className="text-detail text-dim">
          A signed <code className="font-mono">.dossirolic</code> file, issued with your contract.
        </div>
      </div>
      <Facts
        rows={[
          ['Signature', 'Ed25519, verified at every start'],
          ['Seats', '400, refused locally at 401'],
          ['Expires', '31 October 2026'],
          ['Connectivity', 'None required, ever'],
          ['On expiry', 'Read-only for 14 days, then sign-in refused'],
          ['Your records', 'Never touched by any licence state'],
          ...(modelId === 'air-gapped' ? [['Delivery', 'Carried in by hand']] : []),
        ]}
      />
      <Callout tone="blue" title="It cannot be raised by editing data">
        Seat counts are read from the signed licence, not from a database column. Raising the
        number in Postgres changes nothing — the deployment verifies the signature before it will
        start.
      </Callout>
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
      <div className="flex flex-wrap gap-2">
        {(cloud
          ? ['Microsoft Entra ID', 'Okta', 'Active Directory', 'LDAP']
          : ['Active Directory', 'LDAP']
        ).map((name, i) => (
          <Choice key={name} on={i === 0}>
            {name}
          </Choice>
        ))}
      </div>
      {!cloud ? (
        <Foot>
          Cloud providers are not reachable from an air-gapped deployment, so they are not offered.
        </Foot>
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
      <div className="flex flex-col gap-2">
        {[
          ['ng-lagos-1', 'Lagos', 'The default. 112 of 184 tenancies.'],
          ['ng-abuja-1', 'Abuja', 'Second region in Nigeria. 40 tenancies.'],
          ['offshore', 'Outside Nigeria', 'Written request only, with the residency clause struck out.'],
        ].map(([id, name, note], i) => (
          <Choice key={id} on={i === 0} wide>
            <span className="text-row font-semibold">{name}</span>
            <span className="text-meta font-normal opacity-75">{id}</span>
            <span className="col-span-full text-meta font-normal leading-[1.45] opacity-80">
              {note}
            </span>
          </Choice>
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
      <div className="flex flex-wrap gap-2">
        {['Start from a template', 'Import from a file share', 'Build by hand'].map((label, i) => (
          <Choice key={label} on={start === i} onClick={() => setStart(i)}>
            {label}
          </Choice>
        ))}
      </div>
      <Foot>{notes[start]}</Foot>

      <div className="mt-4 border border-line bg-surface">
        <PanelHead>Draft structure · 9 cabinets, 2 need an owner</PanelHead>
        {TREE.map(([name, depth, tail]) => (
          <div
            key={`${name}-${depth}`}
            className="flex items-center gap-2.5 border-b border-line-faint py-1.5 pr-[14px] text-ui last:border-b-0"
            style={{ paddingLeft: 13 + depth * 15 }}
          >
            <span className="shrink">{name}</span>
            {tail ? (
              <span
                className={
                  tail === 'Restricted'
                    ? 'chip chip--red'
                    : tail === 'Passcode' || tail === 'No owner'
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

function BrandingBody({ modelId, org }) {
  const [accent, setAccent] = useState(0);
  const accents = [
    ['Dossiro blue', '#25508C', 'The default. Chosen for legibility against white text at small sizes.'],
    ['Deep green', '#1F6F4A', 'Passes contrast against white.'],
    ['Deep indigo', '#2F3A76', 'Passes contrast against white. Distinct from the blue used for links.'],
    ['Oxblood', '#7A2E33', 'Reads as a warning colour in parts of the interface. Not recommended.'],
  ];
  return (
    <>
      <div className="border border-dashed border-line-strong bg-surface p-[18px] text-center">
        <div className="mb-[3px] text-row font-semibold">Drop your logo here</div>
        <div className="text-detail text-dim">
          SVG or PNG. Shown at 19px tall, so simple marks read best.
        </div>
      </div>

      <div className="mb-[7px] mt-[18px] text-detail font-semibold text-muted">
        One accent colour
      </div>
      <div className="flex flex-wrap gap-2">
        {accents.map(([label, hex], i) => (
          <Choice key={label} on={accent === i} onClick={() => setAccent(i)}>
            <span className="h-[14px] w-[14px] shrink-0" style={{ background: hex }} />
            {label}
          </Choice>
        ))}
      </div>
      <Foot>{accents[accent][2]}</Foot>

      {/* The preview carries the model's real address, because that is the part
          people check. A preview showing a generic one would be the only thing
          on this screen that is not true of their tenancy. */}
      <div className="mt-4 border border-line bg-desk">
        <div className="border-b border-line bg-chrome px-3 py-[7px] font-mono text-chip text-soft">
          {addressFor(modelId, org)}
        </div>
        <div className="mx-auto my-[22px] max-w-[300px] border border-line bg-surface p-[22px]">
          <div className="mb-[14px] h-[30px] w-[30px]" style={{ background: accents[accent][1] }} />
          <div className="text-head font-bold tracking-[-0.015em]">Sign in to {org.name}</div>
          <div className="mb-4 mt-[3px] text-detail text-dim">Use your work account.</div>
          <div
            className="flex h-[34px] items-center justify-center text-detail font-semibold text-white"
            style={{ background: accents[accent][1] }}
          >
            Continue with Microsoft
          </div>
        </div>
      </div>

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

/* -- small pieces ----------------------------------------------------------

   Components rather than repeated class strings: a heading used eleven times
   should have one definition, the same as it did when it was a CSS class.
   -------------------------------------------------------------------------- */

const Eyebrow = ({ children }) => (
  <div className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.1em] text-faint">
    {children}
  </div>
);

const Title = ({ children }) => (
  <h1 className="mb-2.5 text-screen font-bold tracking-[-0.02em]">{children}</h1>
);

const Lede = ({ children }) => (
  <p className="mb-[22px] max-w-[62ch] text-body leading-[1.6] text-muted">{children}</p>
);

const Foot = ({ children }) => (
  <p className="mt-2.5 max-w-[62ch] text-detail leading-[1.55] text-dim">{children}</p>
);

const Actions = ({ children }) => (
  <div className="mt-6 border-t border-line-soft pt-[18px]">{children}</div>
);

const PanelHead = ({ children }) => (
  <div className="border-b border-line bg-surface-3 px-[14px] py-2 text-chip font-semibold text-dim">
    {children}
  </div>
);

function PrimaryButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[30px] cursor-pointer items-center justify-center whitespace-nowrap border border-blue bg-blue px-[14px] text-ui font-semibold text-white hover:border-blue-hover hover:bg-blue-hover"
    >
      {children}
    </button>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className="h-[38px] w-full min-w-0 flex-1 border border-line-strong bg-surface px-[14px] text-body"
    />
  );
}

function Choice({ on, wide, onClick, children }) {
  const base = 'cursor-pointer border text-ui font-semibold px-[14px] ';
  const skin = on
    ? 'border-ink bg-ink text-white'
    : 'border-line-strong bg-surface text-muted hover:bg-row-hover';
  const shape = wide
    ? 'grid w-full grid-cols-[1fr_auto] gap-x-[14px] gap-y-1 whitespace-normal py-[11px] text-left'
    : 'flex h-[34px] items-center gap-2 whitespace-nowrap';
  return (
    <button type="button" onClick={onClick} className={base + shape + ' ' + skin}>
      {children}
    </button>
  );
}

function Facts({ rows, note }) {
  return (
    <div className="border border-line bg-surface">
      {rows.map(([k, v]) => (
        // last-of-type rather than last-child: a note may follow the rows, and
        // the bottom row should still lose its divider when it does.
        <div
          key={k}
          className="grid grid-cols-[180px_1fr] gap-[14px] border-b border-line-faint px-[14px] py-[9px] text-ui [&:last-of-type]:border-b-0 max-mid:grid-cols-1 max-mid:gap-0.5"
        >
          <span className="text-dim">{k}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
      {note ? (
        <p className="border-t border-line-soft bg-surface-2 px-[14px] py-[11px] text-detail leading-[1.55] text-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Rows({ head, rows }) {
  return (
    <div className="border border-line bg-surface">
      <div
        className="grid items-baseline gap-[14px] border-b border-line bg-surface-3 px-[14px] py-2 text-chip font-semibold text-dim"
        style={cols(head.length)}
      >
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r[0]}
          className="grid items-baseline gap-[14px] border-b border-line-faint px-[14px] py-2 text-ui last:border-b-0"
          style={cols(head.length)}
        >
          {r.map((c, i) => (
            <span key={i} className={i === 0 ? 'font-medium' : undefined}>
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
    <label className="mb-[14px] block">
      <span className="mb-[5px] block text-detail font-semibold text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-[5px] block text-chip text-dim">{hint}</span> : null}
    </label>
  );
}

const TONE = {
  blue: 'border-blue-border bg-blue-bg text-muted',
  ochre: 'border-ochre-border bg-ochre-bg text-ochre',
  red: 'border-red-border bg-red-bg text-red',
};

function Callout({ tone, title, children }) {
  return (
    <div className={`mt-4 border px-3 py-2.5 text-detail leading-[1.55] ${TONE[tone]}`}>
      <div className="mb-0.5 font-bold">{title}</div>
      <div className="leading-[1.55]">{children}</div>
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
      return finished ? 'Installed · 400 seats to 31 October' : 'No licence installed';
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
