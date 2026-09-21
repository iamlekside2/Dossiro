import { useState } from 'react';
import { ins } from './ins.js';
import { btn, callout, chip } from '../../ui.js';

/* Small shared building blocks ------------------------------------------- */

function Section({ label, children, note }) {
  return (
    <div className={ins.section}>
      {label ? <div className={ins.label}>{label}</div> : null}
      {children}
      {note ? <div className={ins.note}>{note}</div> : null}
    </div>
  );
}

function Actions({ items }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      {items.map((a, i) => (
        <button key={a} type="button" className={btn(i === 0 ? 'primary' : undefined)}>
          {a}
        </button>
      ))}
    </div>
  );
}

function ListRow({ children, last }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: last ? 'none' : '1px solid var(--border-faint)' }}>
      {children}
    </div>
  );
}

/* -- Invoices › Line items ------------------------------------------------ */

const LINES = [
  ['Regional freight, Zone 2', '$28,400.00', '142 loads × $200.00 · GL 6100', '99%'],
  ['Fuel surcharge', '$6,248.00', '15.4% of base · GL 6110', '98%'],
  ['Detention, 43 hours', '$12,040.00', '43 h × $280.00 · GL 6120', '86%'],
  ['Pallet handling', '$1,420.00', '710 pallets × $2.00 · GL 6130', '97%'],
  ['Documentation fee', '$480.00', '12 shipments × $40.00 · GL 6140', '96%'],
  ['Insurance recovery', '$324.40', 'Pro rata · GL 6150', '95%'],
];

export function LineItemsPane() {
  return (
    <div>
      <Section label="6 line items extracted">
        <div style={{ fontSize: 12.5, color: 'var(--blue)', marginBottom: 10 }}>matched to PO-77120</div>

        {LINES.map(([desc, amount, detail, conf], i) => {
          const high = Number.parseInt(conf, 10) >= 95;
          return (
            <ListRow key={desc} last={i === LINES.length - 1}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13 }}>{desc}</span>
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{amount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginTop: 3 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{detail}</span>
                <span className={chip(high ? 'green' : 'ochre')}>{conf}</span>
              </div>
            </ListRow>
          );
        })}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '9px 10px',
            margin: '10px -10px 0',
            background: 'var(--surface-3)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span>Total</span>
          <span>$48,912.40</span>
        </div>

        <div className={callout('ochre')} style={{ marginTop: 12 }}>
          Detention is $860 above the contracted rate of $220 per hour. Approving posts the variance
          to Finance for review.
        </div>

        <Actions items={['Approve and post', 'Dispute']} />
      </Section>
    </div>
  );
}

/* -- Ingest › Redact ------------------------------------------------------ */

const PII = [
  ['National insurance number', 'Timesheet_Facilities_W32.pdf', 'page 2', '99%', true],
  ['Bank account and sort code', 'Timesheet_Facilities_W32.pdf', 'page 2', '98%', true],
  ['Home address', 'NDA_ContractorTan_2026-07-30.pdf', 'page 4', '97%', true],
  ['Date of birth', 'NDA_ContractorTan_2026-07-30.pdf', 'page 1', '96%', true],
  ['Personal phone number', 'DeliveryNote_Harbor_2026-08-03.pdf', 'page 1', '94%', true],
  ['Signature image', 'NDA_ContractorTan_2026-07-30.pdf', 'page 6', '88%', false],
  ['Passport number', 'Timesheet_Facilities_W32.pdf', 'page 3', '71%', false],
];

export function RedactPane() {
  const [checked, setChecked] = useState(() => PII.map((p) => p[4]));
  const count = checked.filter(Boolean).length;

  return (
    <Section label="14 items of personal data found">
      {PII.map(([type, file, page, conf, ], i) => {
        const high = Number.parseInt(conf, 10) >= 95;
        return (
          <ListRow key={`${type}-${i}`} last={i === PII.length - 1}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() =>
                  setChecked((c) => c.map((v, j) => (j === i ? !v : v)))
                }
              />
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{type}</div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text-dim)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file} · {page}
                </div>
              </div>
              <span className={chip(high ? 'green' : 'ochre')}>{conf}</span>
            </div>
          </ListRow>
        );
      })}

      <div className={callout('blue')} style={{ marginTop: 12 }}>
        Redactions are burned into the shared copy. The unredacted original stays in restricted
        storage, reachable only by the records manager and named auditors.
      </div>

      <Actions items={[`Apply ${count} redaction${count === 1 ? '' : 's'}`, 'Preview']} />

      <div className={ins.note}>
        Applying also sets HIPAA handling on this record and starts a six-year retention clock.
      </div>
    </Section>
  );
}

/* -- Convert -------------------------------------------------------------- */

const JOBS = [
  ['TIFF → searchable PDF/A', 'Scanned bundles with an OCR text layer', '62 files', 'Ready'],
  ['Office → PDF', 'Word and Excel originals kept alongside', '41 files', 'Ready'],
  ['Barcode split', 'One record per separator sheet', '18 files', 'Ready'],
  ['Audio → transcript', 'Diarised, indexed for search', '3 files', 'Running'],
  ['Outside-counsel export set', 'Watermarked, no download', '1 set', 'Ready'],
];

export function ConvertPane() {
  return (
    <Section
      label="Conversion jobs"
      note="Originals are kept as archival masters. PDF/A is the default for anything scanned."
    >
      {JOBS.map(([name, desc, count, state], i) => (
        <ListRow key={name} last={i === JOBS.length - 1}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{count}</span>
              <span className={chip(state === 'Running' ? 'ochre' : 'green')}>{state}</span>
            </div>
          </div>
        </ListRow>
      ))}
      <Actions items={['Run 4 selected', 'Schedule…']} />
    </Section>
  );
}

/* -- E-forms › Form ------------------------------------------------------- */

export function FormPane() {
  return (
    <div>
      <Section label="Vendor onboarding">
        {[
          ['Status', 'Live'],
          ['Fields', '7'],
          ['Submissions', '418 this year'],
          ['On submit', 'Starts procurement approval'],
          ['Files to', 'Legal / Vendor / Active'],
        ].map(([k, v]) => (
          <div className={ins.kvrow} key={k}>
            <span className={ins.k}>{k}</span>
            <span style={{ fontSize: 14 }}>{v}</span>
          </div>
        ))}
        <div className={callout('blue')} style={{ marginTop: 12 }}>
          Every submission originates a workflow and becomes a searchable record in its own right.
        </div>
        <Actions items={['Publish changes', 'Preview form']} />
      </Section>
    </div>
  );
}

/* -- Route / Approval ----------------------------------------------------- */

const ROUTE = [
  ['E-form intake', 'Submitted 1 August', true],
  ['Procurement approval', 'Approved 4 August, J. Mensah', true],
  ['Legal review', 'Approved 11 August, R. Tan', true],
  ['Counter-signature', 'Waiting on you', false],
  ['General Counsel', 'Required, cap exceeds authority', false],
];

export function RoutePane({ record }) {
  return (
    <div>
      <Section label="Approval route">
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{record[1]}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>
          {record[4] || 'Counter-signature, 3 of 4'}
        </div>

        <div>
          {ROUTE.map(([step, detail, done], i) => (
            <div key={step} style={{ display: 'flex', gap: 11 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 10px' }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    border: `2px solid ${done ? 'var(--blue)' : 'var(--border-strong)'}`,
                    background: done ? 'var(--blue)' : 'transparent',
                    flex: '0 0 auto',
                    marginTop: 4,
                  }}
                />
                {i < ROUTE.length - 1 && (
                  <span style={{ width: 1, flex: '1 1 auto', minHeight: 26, background: 'var(--border-strong)' }} />
                )}
              </div>
              <div style={{ paddingBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: done ? 400 : 600 }}>{step}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div className={callout('blue')}>
          What changed: the liability cap rose from six to twelve months of fees. Everything else is
          unchanged from version 3.1.
        </div>

        <Actions items={['Approve and sign', 'Return']} />

        <div className={ins.note}>
          Approval is recorded with your certificate, a timestamp and this device’s fingerprint.
        </div>
      </Section>
    </div>
  );
}

/* -- Approvals › Changes -------------------------------------------------- */

export function DiffPane() {
  return (
    <Section label="What changed">
      {[
        ['Liability cap', '6 → 12 months of fees', 'ochre', 'Material'],
        ['Notice period', 'Unchanged, 90 days', 'green', 'No change'],
        ['Confidentiality carve-out', 'Added as clause 11.3', 'ochre', 'New'],
        ['Other edits', 'Two typographic corrections', '', 'Minor'],
      ].map(([k, v, tone, tag], i, a) => (
        <ListRow key={k} last={i === a.length - 1}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13 }}>{k}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{v}</div>
            </div>
            <span className={chip(tone)}>{tag}</span>
          </div>
        </ListRow>
      ))}
      <div className={callout('ochre')} style={{ marginTop: 12 }}>
        The liability change exceeds your unit’s standing authority and will also require the
        General Counsel.
      </div>
    </Section>
  );
}

/* -- HR › Employee file --------------------------------------------------- */

const CHECKLIST = [
  ['Signed contract', true, 'Complete', 'green'],
  ['Right to work', true, 'Expiring', 'ochre'],
  ['Bank details', true, 'Complete', 'green'],
  ['Emergency contact', true, 'Complete', 'green'],
  ['Policy acknowledgements', true, 'Complete', 'green'],
  ['Confidentiality agreement', true, 'Complete', 'green'],
  ['Qualifications', false, 'Outstanding', 'red'],
  ['Probation review', false, 'Scheduled', ''],
  ['Equipment sheet', false, 'Outstanding', 'red'],
];

export function HrFilePane({ record }) {
  return (
    <div>
      <Section label="Employee file">
        <div style={{ fontSize: 14, fontWeight: 600 }}>{record[1]}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>{record[2]}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
          <span style={{ color: 'var(--text-dim)' }}>Completeness</span>
          <span style={{ fontWeight: 600 }}>78% · 7 of 9</span>
        </div>
        <div style={{ height: 6, background: 'var(--border-soft)' }}>
          <div style={{ width: '78%', height: 6, background: 'var(--ochre)' }} />
        </div>

        <div style={{ marginTop: 14 }}>
          {CHECKLIST.map(([item, done, state, tone], i) => (
            <ListRow key={item} last={i === CHECKLIST.length - 1}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    flex: '0 0 16px',
                    border: `1px solid ${done ? 'var(--green)' : 'var(--border-strong)'}`,
                    background: done ? 'var(--green)' : 'var(--surface)',
                    color: '#fff',
                    fontSize: 10.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {done ? '✓' : ''}
                </span>
                <span style={{ flex: '1 1 auto', fontSize: 13 }}>{item}</span>
                <span className={chip(tone)}>{state}</span>
              </div>
            </ListRow>
          ))}
        </div>

        <div className={callout('ochre')} style={{ marginTop: 12 }}>
          The right-to-work check expires in 41 days. Chasers go out automatically at 30 days.
        </div>

        <Actions items={['Request missing documents', 'Open file']} />

        <div className={ins.note}>
          Personnel files are restricted to HR and the employee. Managers see completeness but never
          contents.
        </div>
      </Section>
    </div>
  );
}

/* -- Administration › Capabilities ---------------------------------------- */

const CAPS = [
  ['Read records in their unit', true, 'Legal'],
  ['Modify and version records', true, 'Legal'],
  ['Classify and reclassify', true, 'Up to Confidential'],
  ['Share externally', true, 'Non-restricted only'],
  ['Approve within authority', true, 'Up to $250,000'],
  ['Grant access to others', true, 'Their unit only'],
  ['Restore deleted records', true, '90-day window'],
  ['Purge records permanently', false, 'Nobody outside Records'],
  ['Alter the audit trail', false, 'Nobody'],
];

export function CapabilitiesPane({ record }) {
  return (
    <Section label={`${record[4] || 'Records Manager'} · 12 people hold this role`}>
      {CAPS.map(([cap, on, scope], i) => (
        <ListRow key={cap} last={i === CAPS.length - 1}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 17,
                height: 17,
                flex: '0 0 17px',
                border: `1px solid ${on ? 'var(--blue)' : 'var(--border-strong)'}`,
                background: on ? 'var(--blue)' : 'var(--surface)',
                color: '#fff',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {on ? '✓' : ''}
            </span>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{cap}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{scope}</div>
            </div>
          </div>
        </ListRow>
      ))}
      <div className={callout('blue')} style={{ marginTop: 12 }}>
        Role changes take effect on the next sync and are logged against your name.
      </div>
    </Section>
  );
}

/* -- Administration › Integrations ---------------------------------------- */

const INTEGRATIONS = [
  ['Microsoft 365', 'Edit Word and Excel records in place; the version returns here.', 'Connected'],
  ['SharePoint', 'Two-way sync for the Facilities and Finance libraries.', 'Connected'],
  ['Adobe Acrobat', 'Open, edit and re-save PDFs without leaving the record.', 'Connected'],
  ['Adobe Sign', 'Route signature requests to external counterparties.', 'Connected'],
  ['WhatsApp Business', 'Field staff send documents straight into capture.', 'Connected'],
  ['Dynamics 365', 'Match invoices against purchase orders and receipts.', 'Setup'],
];

export function IntegrationsPane() {
  return (
    <Section label="Connected systems">
      {INTEGRATIONS.map(([name, desc, state], i) => (
        <ListRow key={name} last={i === INTEGRATIONS.length - 1}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.45 }}>{desc}</div>
            </div>
            <span className={chip(state === 'Connected' ? 'green' : 'ochre')}>{state}</span>
          </div>
          <button
            type="button"
            style={{ background: 'none', border: 0, padding: 0, marginTop: 4, fontSize: 12.5, color: 'var(--blue)', cursor: 'pointer' }}
          >
            Configure
          </button>
        </ListRow>
      ))}
      <div className={callout('blue')} style={{ marginTop: 12 }}>
        Word and Acrobat edit the stored record in place. Check out here, save there, and the new
        version returns automatically.
      </div>
    </Section>
  );
}

/* -- Audit › Compliance --------------------------------------------------- */

const COMPLIANCE = [
  ['SOC 2 Type II', 'Reporting period 1 Jan – 31 Dec 2026. No exceptions raised.', 'Current', 'green'],
  ['SOC 1', 'Controls over financial reporting, 12 of 12 operating effectively.', '12 of 12', 'green'],
  ['SOC 3', 'Public summary report available to customers.', 'Published', 'green'],
  ['HIPAA readiness', 'Technical safeguards in place; two administrative gaps open.', '2 gaps', 'ochre'],
  ['Retention and legal hold', '7 policies enforced, 4 matters under hold.', 'Enforced', 'green'],
];

export function CompliancePane() {
  return (
    <Section label="Compliance posture">
      {COMPLIANCE.map(([name, desc, state, tone], i) => (
        <ListRow key={name} last={i === COMPLIANCE.length - 1}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.45 }}>{desc}</div>
            </div>
            <span className={chip(tone)}>{state}</span>
          </div>
        </ListRow>
      ))}
      <div className={callout('ochre')} style={{ marginTop: 12 }}>
        Two HIPAA gaps remain: an unsigned business associate agreement with one processor, and four
        mailboxes still delivering attachments unencrypted.
      </div>
      <Actions items={['Export evidence pack', 'Open gaps']} />
    </Section>
  );
}

/* -- Administration › Recovery -------------------------------------------- */

const RECOVERABLE = [
  ['Board-minutes_2026-06.pdf', 'Amina Okoro', '2 days ago', '88 days'],
  ['Rate-card_Northwind_2026H1.xlsx', 'Joseph Mensah', '9 days ago', '81 days'],
  ['Facilities inspection, July', 'Lara Bello', '31 days ago', '59 days'],
  ['Timesheets, week 28', 'Sade Njoku', '44 days ago', '46 days'],
  ['Vendor pack, Coastal Freight', 'Amina Okoro', '61 days ago', '29 days'],
];

export function RecoveryPane() {
  return (
    <div>
      <Section label="Recoverable items">
        {RECOVERABLE.map(([name, who, when, left], i) => {
          const urgent = Number.parseInt(left, 10) < 60;
          return (
            <ListRow key={name} last={i === RECOVERABLE.length - 1}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                    Deleted by {who} · {when}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 auto' }}>
                  <span style={{ fontSize: 11.5, color: urgent ? 'var(--ochre)' : 'var(--text-faint)' }}>
                    {left} left
                  </span>
                  <button
                    type="button"
                    style={{ background: 'none', border: 0, padding: 0, fontSize: 12.5, color: 'var(--blue)', cursor: 'pointer' }}
                  >
                    Restore
                  </button>
                </div>
              </div>
            </ListRow>
          );
        })}
      </Section>

      <Section label="Point in time">
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
          Restore the repository to any moment in this range.
        </div>
        <div style={{ height: 6, background: 'var(--border-soft)' }}>
          <div style={{ width: '100%', height: 6, background: 'var(--blue)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-faint)', marginTop: 5 }}>
          <span>10 July</span>
          <span>14 August 09:41</span>
        </div>

        <div className={callout('red')} style={{ marginTop: 14 }}>
          Four matters are under legal hold. They cannot be deleted and will not be overwritten by a
          restore.
        </div>
      </Section>
    </div>
  );
}
