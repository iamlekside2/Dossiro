import { BranchPane, BranchStaffPane, HostnamePane } from './panes/Branch.jsx';
import Preview from './panes/Preview.jsx';
import {
  DocumentAccessPane,
  DocumentSummaryPane,
  DocumentVersionsPane,
} from './panes/Document.jsx';
import { AccessPane, DetailsPane, EditPane, SummaryPane, VersionsPane } from './panes/Core.jsx';
import { ShareLinkPane } from './panes/Share.jsx';
import { SearchMatchPane } from './panes/Search.jsx';
import {
  CapabilitiesPane,
  CompliancePane,
  ConvertPane,
  DiffPane,
  FormPane,
  HrFilePane,
  IntegrationsPane,
  LineItemsPane,
  RecoveryPane,
  RedactPane,
  RoutePane,
} from './panes/Area.jsx';

const BODIES = {
  branch: BranchPane,
  branchstaff: BranchStaffPane,
  hostname: HostnamePane,
  preview: Preview,
  summary: SummaryPane,
  edit: EditPane,
  history: VersionsPane,
  access: AccessPane,
  details: DetailsPane,
  lines: LineItemsPane,
  redact: RedactPane,
  convert: ConvertPane,
  form: FormPane,
  route: RoutePane,
  diff: DiffPane,
  hrfile: HrFilePane,
  caps: CapabilitiesPane,
  integrations: IntegrationsPane,
  compliance: CompliancePane,
  recovery: RecoveryPane,
};

export default function Inspector({
  area,
  paneSet,
  active,
  onSelect,
  record,
  details,
  detailNote,
  access,
  onChanged,
  showBack,
  onBack,
}) {
  // Which panes a real record can answer for itself, per area. Everything not
  // listed here is still the design's illustration, and the note below says so.
  const LIVE_BODIES = {
    repo: { summary: DocumentSummaryPane, history: DocumentVersionsPane, access: DocumentAccessPane },
    audit: { details: DetailsPane },
    sharing: { access: ShareLinkPane },
    // A search result is a document, so the Repository's Summary pane answers
    // for it unchanged; only the match itself needs its own describer.
    search: { summary: DocumentSummaryPane, details: SearchMatchPane },
  };

  const wired = (Boolean(record?.record) && LIVE_BODIES[area]) || null;
  const Body = (wired ? wired[active] : null) ?? BODIES[active] ?? DetailsPane;

  /** Panes still showing the handoff's illustration beside a live row. */
  const illustrated = Boolean(wired) && !wired[active];

  const ILLUSTRATION_NOTE = {
    audit: 'The event is real; this pane is from the design. Event shows the actual record.',
    sharing: 'The link is real; this pane is from the design. Link shows the actual settings.',
    search: 'The result is real; this pane is from the design. Summary and Match show the actual document.',
    repo: 'The row is real; this pane is from the design. Summary, Versions and Access show the actual document.',
  };
  const illustrationNote = ILLUSTRATION_NOTE[area] ?? ILLUSTRATION_NOTE.repo;

  return (
    <div className="inspector">
      <div className="inspector__backRow">
        {/* Phone only: the inspector replaces the list, so it needs a way out. */}
        {showBack && (
          <button type="button" className="inspector__back" onClick={onBack}>
            <span aria-hidden="true">‹</span>
            <span>{record?.[1] ? 'List' : 'Back'}</span>
          </button>
        )}
        <div className="inspector__tabs" role="tablist" style={{ flex: '1 1 auto', minWidth: 0 }}>
          {paneSet.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === active}
              className={`itab${id === active ? ' is-active' : ''}`}
              onClick={() => onSelect(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Shown only on the panes that are still the handoff's. A real filename
          above an invented contract is the most misleading state in the app,
          and the note disappears pane by pane as each one is wired. */}
      {illustrated && (
        <div className="inspector__sampleNote">
          <span className="chip chip--ochre">Illustration</span>
          <span>{illustrationNote}</span>
        </div>
      )}

      <div className="inspector__body">
        {/* Only one body mounts at a time, so each keeps its own local state
            (signature mode, passcode toggle) scoped to a single visit. */}
        {record ? (
          <Body
            key={active}
            area={area}
            record={record}
            details={details}
            detailNote={detailNote}
            access={access}
            onChanged={onChanged}
          />
        ) : (
          <div className="ins__section ins__note">Select a row to see its details.</div>
        )}
      </div>
    </div>
  );
}
