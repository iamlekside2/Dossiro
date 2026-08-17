import { useEffect, useMemo, useState } from 'react';
import { useIsNarrow, useIsPhone } from '../hooks/useMediaQuery.js';
import LockedDrawerPrompt from '../screens/LockedDrawerPrompt.jsx';
import { LOCKED_DRAWERS, useSession } from '../session/SessionContext.jsx';
import { useAreaRows } from './useAreaRows.js';
import {
  ACCESS,
  BULK,
  COLS,
  COLS_BY_SCOPE,
  CRUMBS,
  DETAILS,
  DETAIL_NOTES,
  FIND_PLACEHOLDER,
  FIND_PLACEHOLDER_BY_SCOPE,
  PANES,
  PANES_BY_SCOPE,
  ROWS,
  SCOPES,
  SCOPE_FILTERS,
  STATUS,
  TABS,
  TOOLBAR,
  TOOLBAR_BY_SCOPE,
} from '../data/areas.js';
import CreateDialog, { dialogForVerb } from './CreateDialog.jsx';
import Inspector from './Inspector.jsx';
import ListPane from './ListPane.jsx';
import ScopePane from './ScopePane.jsx';
import StatusBar from './StatusBar.jsx';
import TabStrip from './TabStrip.jsx';
import Toolbar from './Toolbar.jsx';

/** Date-ish columns sort chronologically, not alphabetically on their labels. */
const DATE_COL = /edited|updated|when|due|expires/i;

/** Maps a column index to the tuple index that holds its value. */
const COL_KEY = [1, 4, 5, 6];

export default function Workbench() {
  const [tab, setTab] = useState('repo');
  const [scope, setScope] = useState(null); // null = the area's default
  const [sortCol, setSortCol] = useState(null); // null = authored order
  const [sortDir, setSortDir] = useState('desc');
  const [row, setRow] = useState(0);
  const [pane, setPane] = useState('preview');
  const [sel, setSel] = useState({});

  const { isUnlocked, unlockDrawer } = useSession();
  /** Scope index awaiting a drawer passcode, or null. */
  const [pendingDrawer, setPendingDrawer] = useState(null);

  const isPhone = useIsPhone();
  const isNarrow = useIsNarrow();
  /** Phone only: which single pane is on screen. */
  const [mobilePane, setMobilePane] = useState('list');
  const [scopeOpen, setScopeOpen] = useState(false);

  // Coming back to a wide viewport must not strand the user in a phone-only
  // state — the drawer would stay open over a layout that has its own column.
  useEffect(() => {
    if (!isNarrow) setScopeOpen(false);
    if (!isPhone) setMobilePane('list');
  }, [isNarrow, isPhone]);

  /** Which "New …" dialog is open, if any. */
  const [dialog, setDialog] = useState(null);

  const scopeDef = SCOPES[tab];
  const scopeItems = scopeDef[2];
  const scopeIndex = scope == null ? scopeDef[3] : Math.min(scope, scopeItems.length - 1);

  // Scopes that list a different kind of record describe it differently too:
  // a branch has Branch and Staff, not Capabilities and Recovery.
  const paneSet = PANES_BY_SCOPE[tab]?.[scopeIndex] ?? PANES[tab];
  // Some scopes list a different kind of record from their area's default and
  // need their own grid — Administration goes people, roles, branches, addresses.
  const cols = COLS_BY_SCOPE[tab]?.[scopeIndex] ?? COLS[tab];

  /* Switching area resets everything that is area-specific. Carrying a stale
     scope or inspector tab across areas produces states that cannot be
     reached any other way. */
  function goTab(next) {
    setTab(next);
    setPane(PANES[next][0][0]);
    setRow(0);
    setScope(null);
    setSortCol(null);
    setSel({});
    setMobilePane('list');
    setScopeOpen(false);
  }

  function goScope(index) {
    const name = scopeItems[index][0];

    // Some drawers carry their own passcode on top of role access. Ask for it
    // before the scope changes, so the list never briefly shows its contents.
    if (LOCKED_DRAWERS[name] && !isUnlocked(name)) {
      setPendingDrawer(index);
      setScopeOpen(false);
      return;
    }

    setScope(index);
    setRow(0);
    setSel({}); // a selection made under a different filter is meaningless
    setScopeOpen(false); // the drawer has done its job
    setMobilePane('list');
  }

  /**
   * On a phone the inspector is a separate view, so picking a row navigates to
   * it. On wider screens both are visible and selection just updates the
   * inspector in place.
   */
  function goRow(index) {
    setRow(index);
    if (isPhone) setMobilePane('inspector');
  }

  function goSort(index) {
    if (sortCol === index) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(index);
      setSortDir('asc');
    }
    setRow(0);
  }

  // Live areas fetch; the rest fall back to the handoff's sample rows.
  const source = useAreaRows(tab, scopeIndex);

  const visible = useMemo(() => {
    const all = source.rows ?? ROWS[tab] ?? [];
    const pred = (SCOPE_FILTERS[tab] || {})[scopeIndex];
    let out = pred ? all.filter(pred) : all.slice();

    if (sortCol != null) {
      const isDate = DATE_COL.test(cols[sortCol][0]);
      const authored = new Map(all.map((r, i) => [r, i]));
      const key = COL_KEY[sortCol];
      out = out.slice().sort((a, b) => {
        if (isDate) {
          // The sample rows carry display strings, not timestamps, so authored
          // order stands in for chronology. A real implementation sorts on the
          // underlying date.
          const base = authored.get(a) - authored.get(b);
          return sortDir === 'asc' ? -base : base;
        }
        const base = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
        return sortDir === 'asc' ? base : -base;
      });
    }
    return out;
  }, [tab, scopeIndex, sortCol, sortDir, COLS, COLS_BY_SCOPE, source.rows]);

  const isDenied = tab === 'repo' && scopeIndex === 7;
  // Either the scripted demo state, or a live area genuinely still fetching.
  const isLoading = (tab === 'capture' && scopeIndex === 1) || source.loading;
  const isEmpty = !isDenied && !isLoading && !source.error && visible.length === 0;
  const rows = isDenied || isLoading || source.error ? [] : visible;

  const selectedRow = rows[row] || rows[0] || ROWS[tab][0];
  const activePane = paneSet.some((p) => p[0] === pane) ? pane : paneSet[0][0];
  const selCount = Object.values(sel).filter(Boolean).length;

  /* Repository rewrites the breadcrumb's last segment; every other area
     appends the scope, so a search query or batch identity is never lost. */
  const crumbs = useMemo(() => {
    const base = CRUMBS[tab].slice();
    const label = scopeItems[scopeIndex][0];
    if (scope == null) return base;
    if (tab === 'repo') {
      base[base.length - 1] = label;
      return base;
    }
    return [...base, label];
  }, [tab, scope, scopeIndex, scopeItems]);

  const statusCells = useMemo(() => {
    // A live area reports what it actually loaded, not the handoff's figures.
    const base =
      source.isLive && !source.loading && !source.error && source.status
        ? source.status.slice()
        : STATUS[tab].slice();

    if (isDenied) {
      // The drawer's own count still shows. Seeing that a matter exists and how
      // large it is, without any names, is the point of the denied state — so
      // the status bar must not report it as empty.
      base[0] = `${scopeItems[scopeIndex][2]} records, names withheld`;
    } else if (source.isLive) {
      // A live scope already reported real figures. Overwriting the first cell
      // with a generic count would discard the better information.
    } else if (scope != null) {
      base[0] = `${rows.length} items in this scope`;
    } else if (tab === 'repo') {
      base[1] = `${selCount} selected`;
    }
    return base;
  }, [
    tab,
    scope,
    scopeIndex,
    scopeItems,
    rows.length,
    selCount,
    isDenied,
    source.isLive,
    source.loading,
    source.error,
    source.status,
  ]);

  const shellClass = [
    'wb',
    scopeOpen ? 'is-scope-open' : '',
    isPhone ? `wb--pane-${mobilePane}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="wb__scroll">
      <div className={shellClass}>
        <TabStrip tabs={TABS} active={tab} onSelect={goTab} />

        <Toolbar
          crumbs={crumbs}
          verbs={TOOLBAR_BY_SCOPE[tab]?.[scopeIndex] ?? TOOLBAR[tab]}
          onVerb={(verb) => {
            const kind = dialogForVerb(tab, scopeIndex, verb);
            if (kind) setDialog(kind);
          }}
          findPlaceholder={
            FIND_PLACEHOLDER_BY_SCOPE[tab]?.[scopeIndex] ??
            FIND_PLACEHOLDER[tab] ??
            'Find in this view'
          }
          onOpenScope={() => setScopeOpen(true)}
          scopeLabel={scopeItems[scopeIndex][0]}
        />

        <div className="wb__body">
          {/* Tapping outside the drawer closes it, the way a drawer should.
              Rendered purely on `scopeOpen` and hidden by CSS above the
              breakpoint, so the 1180px threshold lives in exactly one place
              rather than being duplicated in JS where the two can drift. */}
          {scopeOpen && (
            <button
              type="button"
              className="scope__scrim"
              aria-label="Close the scope drawer"
              onClick={() => setScopeOpen(false)}
            />
          )}

          <ScopePane
            heading={scopeDef[0]}
            note={scopeDef[1]}
            items={scopeItems}
            activeIndex={scopeIndex}
            onSelect={goScope}
          />

          <ListPane
            area={tab}
            cols={cols}
            rows={rows}
            selectedIndex={row}
            onSelectRow={goRow}
            isPhone={isPhone}
            scopeIndex={scopeIndex}
            foldColumns={isNarrow}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={goSort}
            sel={sel}
            onToggle={(name) => setSel((m) => ({ ...m, [name]: !m[name] }))}
            onSelectAll={() =>
              setSel(Object.fromEntries(rows.map((r) => [r[1], true])))
            }
            onClear={() => setSel({})}
            bulkVerbs={BULK[tab] ?? []}
            selCount={selCount}
            isDenied={isDenied}
            isLoading={isLoading}
            isEmpty={isEmpty}
            error={source.error}
            onRetry={source.reload}
            isLive={source.isLive}
            overlay={
              pendingDrawer !== null ? (
                <LockedDrawerPrompt
                  drawer={LOCKED_DRAWERS[scopeItems[pendingDrawer][0]]}
                  onUnlock={() => {
                    unlockDrawer(scopeItems[pendingDrawer][0]);
                    setScope(pendingDrawer);
                    setRow(0);
                    setSel({});
                    setMobilePane('list');
                    setPendingDrawer(null);
                  }}
                  onCancel={() => setPendingDrawer(null)}
                />
              ) : null
            }
          />

          <Inspector
            area={tab}
            paneSet={paneSet}
            active={activePane}
            onSelect={setPane}
            record={selectedRow}
            details={DETAILS[tab] ?? DETAILS.repo}
            detailNote={DETAIL_NOTES[tab]}
            access={ACCESS[tab] ?? ACCESS.repo}
            onChanged={source.reload}
            showBack={isPhone}
            onBack={() => setMobilePane('list')}
          />
        </div>
        <StatusBar cells={statusCells} />

        {dialog && (
          <CreateDialog
            kind={dialog}
            onClose={() => setDialog(null)}
            onCreated={source.reload}
          />
        )}
      </div>
    </div>
  );
}
