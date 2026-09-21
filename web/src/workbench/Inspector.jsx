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
import { ins } from './panes/ins.js';
import { chip } from '../ui.js';
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
  hidden,
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
    // 430px above the fold, 380 between 760 and 1180, and the full width on a
    // phone where it replaces the list entirely.
    <div
      className={`min-h-0 w-inspector flex-none flex-col border-l border-line bg-surface-2 max-wide:w-[380px] max-narrow:w-full max-narrow:border-l-0 ${
        hidden ? 'hidden' : 'flex'
      }`}
    >
      <div className="flex items-stretch">
        {/* Phone only: the inspector replaces the list, so it needs a way out. */}
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="hidden h-[30px] flex-none cursor-pointer items-center gap-[7px] whitespace-nowrap border-0 border-b border-r border-line bg-surface-3 px-3 text-ui font-semibold text-blue max-narrow:flex"
          >
            <span aria-hidden="true">‹</span>
            <span>{record?.[1] ? 'List' : 'Back'}</span>
          </button>
        )}
        <div
          role="tablist"
          className="flex h-instabs min-w-0 flex-1 items-stretch border-b border-line max-narrow:overflow-x-auto max-narrow:[scrollbar-width:none] max-narrow:[&::-webkit-scrollbar]:hidden"
        >
          {paneSet.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === active}
              onClick={() => onSelect(id)}
              className={`cursor-pointer whitespace-nowrap border-0 border-r border-line px-[13px] text-detail text-ink max-narrow:h-full max-narrow:px-[14px] ${
                id === active
                  ? 'bg-surface font-semibold shadow-[inset_0_-2px_0_var(--color-blue)]'
                  : 'bg-transparent hover:bg-line-soft'
              }`}
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
        <div className="flex items-start gap-2 border-b border-ochre-border bg-ochre-bg px-3 py-2 text-meta leading-[1.45] text-ochre">
          <span className={chip('ochre', 'mt-px')}>Illustration</span>
          <span>{illustrationNote}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
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
          <div className={ins.noteSection}>Select a row to see its details.</div>
        )}
      </div>
    </div>
  );
}
