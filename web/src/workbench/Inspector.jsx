import { BranchPane, BranchStaffPane, HostnamePane } from './panes/Branch.jsx';
import Preview from './panes/Preview.jsx';
import { AccessPane, DetailsPane, EditPane, SummaryPane, VersionsPane } from './panes/Core.jsx';
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
  const Body = BODIES[active] ?? DetailsPane;

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

      <div className="inspector__body">
        {/* Only one body mounts at a time, so each keeps its own local state
            (signature mode, passcode toggle) scoped to a single visit. */}
        <Body
          key={active}
          area={area}
          record={record}
          details={details}
          detailNote={detailNote}
          access={access}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}
