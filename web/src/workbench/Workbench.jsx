import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsNarrow, useIsPhone } from '../hooks/useMediaQuery.js';
import LockedDrawerPrompt from '../screens/LockedDrawerPrompt.jsx';
import { LOCKED_DRAWERS, useSession } from '../session/SessionContext.jsx';
import api from '../lib/api.js';
import { useAreaRows } from './useAreaRows.js';
import { useFolderScopes } from './useFolderScopes.js';
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
import { LIVE, areaState } from '../data/buildState.js';
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
  const [tab, setTab] = useState('home');
  const [scope, setScope] = useState(null); // null = the area's default
  const [sortCol, setSortCol] = useState(null); // null = authored order
  const [sortDir, setSortDir] = useState('desc');
  const [row, setRow] = useState(0);
  const [pane, setPane] = useState('preview');
  const [sel, setSel] = useState({});
  /** What is typed in the toolbar's find box, per area. */
  const [find, setFind] = useState('');

  const { isUnlocked, unlockDrawer, user } = useSession();
  const navigate = useNavigate();

  // A tenancy with no cabinets is one that has never been set up, and the only
  // person who can fix that is an administrator — so they land on setup instead
  // of an empty repository with every verb pointing at nothing. Everyone else
  // sees the empty workbench, which at least says why it is empty.
  useEffect(() => {
    if (user?.tier !== 'ORG_ADMIN' || user?.isPlatform) return;
    api.folders
      .tree()
      .then((roots) => {
        if ((roots?.length ?? 0) === 0) navigate('/setup', { replace: true });
      })
      .catch(() => undefined);
  }, [user, navigate]);
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

  /**
   * Why the last toolbar action failed.
   *
   * Shown rather than logged: a checkout that quietly does nothing is worse
   * than one that names who is holding the document.
   */
  const [verbError, setVerbError] = useState(null);

  /**
   * Documents a dialog should apply to, when it was opened from the bulk bar
   * rather than the toolbar. Null means "just the selected row".
   */
  const [bulkIds, setBulkIds] = useState(null);

  // Repository's cabinets are real folders; every other area still lists the
  // handoff's sample scopes. Loaded once and kept, so switching areas and back
  // does not refetch the tree.
  const folders = useFolderScopes(true);

  // Search browses the same cabinets, but needs an "everywhere" option the
  // Repository does not: you search across the estate and then narrow, where
  // you file into one place. It is the same tree with one entry in front, so
  // the indices shift by one and searchFolderId accounts for that.
  const searchScopes = useMemo(
    () => [['All cabinets', 0, ''], ...folders.items.map(([l, d, c]) => [l, d + 1, c])],
    [folders.items],
  );

  const scopeDef = SCOPES[tab];
  const scopeItems =
    tab === 'repo' ? folders.items : tab === 'search' && folders.isLive ? searchScopes : scopeDef[2];
  // The handoff's default lands on a deep sample cabinet. A real tree is a
  // different shape and usually shorter, so live folders open at the first one
  // rather than at whatever index the sample happened to use.
  const defaultScope = (tab === 'repo' || tab === 'search') && folders.isLive ? 0 : scopeDef[3];
  const scopeIndex = scope == null
    ? Math.min(defaultScope, scopeItems.length - 1)
    : Math.min(scope, scopeItems.length - 1);

  /** The folder whose documents the list should show, when one is known. */
  const folderId = tab === 'repo' && folders.isLive ? folders.ids[scopeIndex] : undefined;

  /** Index 0 is "All cabinets", so the real folders start one along. */
  const searchFolderId =
    tab === 'search' && folders.isLive && scopeIndex > 0 ? folders.ids[scopeIndex - 1] : undefined;

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
    // A query typed in one area means nothing in the next, and carrying it
    // across would silently hide rows in a view the user has just opened.
    setFind('');
    setQuery('');
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

  // Search asks the server, so it waits for a pause in typing. Everywhere else
  // the find box narrows rows already on screen and can react immediately.
  const [query, setQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQuery(find.trim()), 250);
    return () => clearTimeout(id);
  }, [find]);

  // Live areas fetch; the rest fall back to the handoff's sample rows. What
  // each loader needs from the current view, since a scope means a folder in
  // one area and a filter in another.
  const loaderContext =
    tab === 'home'
      ? { scopeIndex, userId: user?.id }
      : tab === 'repo'
        ? { folderId }
        : tab === 'search'
          ? { query, folderId: searchFolderId }
          : tab === 'audit' ||
              tab === 'sharing' ||
              tab === 'types' ||
              tab === 'approvals' ||
              tab === 'forms' ||
              tab === 'hr' ||
              tab === 'ingest' ||
              tab === 'workflows'
            ? { scopeIndex }
            : null;

  const source = useAreaRows(tab, scopeIndex, true, loaderContext);

  const visible = useMemo(() => {
    const all = source.rows ?? ROWS[tab] ?? [];

    // Scope predicates exist to carve the handoff's one static row list into
    // per-scope subsets by matching its invented text. They must never touch
    // rows that came from the server, which is already scoped — and they are
    // keyed by position, so a real folder tree silently inherits whichever
    // sample predicate happens to sit at that index. Employee records landed on
    // index 5, whose predicate looks for "Coastal", and reported 34 documents
    // above an empty list.
    const pred = source.rows ? null : (SCOPE_FILTERS[tab] || {})[scopeIndex];
    let out = pred ? all.filter(pred) : all.slice();

    // "Find in this view" means exactly that: it narrows what is already on
    // screen. Search is the exception — there the box is the query itself and
    // the server has already applied it, so narrowing again would hide results
    // whose match is in the document body rather than in the rendered row.
    const needle = find.trim().toLowerCase();
    if (needle && tab !== 'search') {
      out = out.filter((r) =>
        r.some((cell) => typeof cell === 'string' && cell.toLowerCase().includes(needle)),
      );
    }

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
  }, [tab, scopeIndex, sortCol, sortDir, COLS, COLS_BY_SCOPE, source.rows, find]);

  // The scripted "Litigation is closed to your role" state belongs to the
  // handoff's sample cabinets. Real folders the caller may not read are simply
  // absent from the tree, so with a live tree there is nothing to deny.
  const isDenied = tab === 'repo' && !folders.isLive && scopeIndex === 7;
  // Either the scripted demo state, or a live area genuinely still fetching.
  const isLoading = (tab === 'capture' && scopeIndex === 1) || source.loading;
  const isEmpty = !isDenied && !isLoading && !source.error && visible.length === 0;
  const rows = isDenied || isLoading || source.error ? [] : visible;

  // With nothing listed there is nothing to inspect. Falling through to the
  // handoff's first row put a fabricated document beside "0 results" — a search
  // for a word that appears nowhere still described an 18-page contract.
  // Sample areas keep the fallback: their whole screen is the illustration.
  const areaIsLive = areaState(tab).state === LIVE;
  const selectedRow = rows[row] || rows[0] || (areaIsLive ? null : ROWS[tab][0]);
  const activePane = paneSet.some((p) => p[0] === pane) ? pane : paneSet[0][0];
  const selCount = Object.values(sel).filter(Boolean).length;

  /** The live document behind the selected row, when there is one. */
  const liveDoc = selectedRow?.record?.id ? selectedRow.record : null;

  /** What a dialog is acting on. */
  const dialogContext = useMemo(
    () => ({
      documentId: liveDoc?.id,
      // One or many. Move and Classify are the two verbs the bulk bar shares
      // with the toolbar, so they accept either and the dialog says which.
      documentIds: bulkIds ?? (liveDoc?.id ? [liveDoc.id] : []),
      documentName: bulkIds
        ? `${bulkIds.length} document${bulkIds.length === 1 ? '' : 's'}`
        : liveDoc?.name,
      classification: liveDoc?.classification,
      folderId,
      folderName: tab === 'repo' ? scopeItems[scopeIndex]?.[0] : undefined,

      // Types: Add field needs to know which type it is adding to.
      typeId: tab === 'types' ? selectedRow?.record?.id : undefined,
      typeName: tab === 'types' ? selectedRow?.record?.name : undefined,
    }),
    [liveDoc, bulkIds, folderId, tab, scopeItems, scopeIndex, selectedRow],
  );

  /**
   * The toolbar, with Repository's lock verb reading the document's state.
   *
   * A static "Check out" beside a document you already hold offers an action
   * that would be refused, and hides the one you actually want.
   */
  const toolbarVerbs = useMemo(() => {
    const base = TOOLBAR_BY_SCOPE[tab]?.[scopeIndex] ?? TOOLBAR[tab];

    if (tab === 'repo' && liveDoc) {
      const mine = liveDoc.checkedOutById && liveDoc.checkedOutById === user?.id;
      return base.map((v) => (v === 'Check out' && mine ? 'Check in' : v));
    }

    // A type is either a draft, published or archived, and only one of the two
    // transitions is meaningful at a time. Offering both means one of them
    // does nothing, which teaches people to distrust the toolbar.
    // Only the transition that means something, in every area that has one.
    // Offering both makes one of them a button that does nothing.
    if (tab === 'forms') {
      const published = selectedRow?.record?.isPublished;
      if (selectedRow?.record == null) return [];
      return base.filter((v) => (published ? v === 'Withdraw' : v === 'Publish'));
    }

    if (tab === 'admin' && scopeIndex === 0) {
      const status = selectedRow?.record?.status;
      return base.filter((v) =>
        v === 'Suspend'
          ? status === 'ACTIVE'
          : v === 'Reinstate'
            ? status === 'SUSPENDED'
            : true,
      );
    }

    if (tab === 'types') {
      const status = selectedRow?.record?.status;
      if (!status) return base.filter((v) => v === 'New type');
      return base.filter((v) =>
        v === 'Publish' ? status !== 'PUBLISHED' : v === 'Archive' ? status === 'PUBLISHED' : true,
      );
    }

    return base;
  }, [tab, scopeIndex, liveDoc, user?.id, selectedRow]);

  /**
   * Toolbar verbs that do something rather than open a form.
   *
   * Reports failure rather than swallowing it: a checkout that silently does
   * nothing is worse than one that says who is holding the document.
   */
  async function runVerb(verb) {
    if (tab === 'types') return runTypeVerb(verb);
    if (tab === 'ingest') return runIngestVerb();
    if (tab === 'approvals') return runApprovalVerb(verb);
    if (tab === 'sharing') return runSharingVerb(verb);
    if (tab === 'forms') return runFormVerb(verb);
    if (tab === 'admin' && (verb.startsWith('Suspend') || verb.startsWith('Reinstate'))) {
      return runAdminVerb(verb);
    }
    if ((tab === 'home' || tab === 'search') && verb.startsWith('Open')) return openBehindRow();
    if (tab !== 'repo' || !liveDoc) return;
    try {
      if (verb.startsWith('Open')) {
        const { url } = await api.documents.content(liveDoc.id);
        window.open(url, '_blank', 'noopener');
        // Revoked on a delay: revoking immediately races the new tab's load.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      if (verb.startsWith('Check out')) {
        await api.documents.checkOut(liveDoc.id);
      } else if (verb.startsWith('Check in')) {
        await api.documents.checkIn(liveDoc.id);
      } else if (verb.startsWith('Share')) {
        setDialog('share');
        return;
      } else {
        return;
      }
      source.reload();
    } catch (err) {
      setVerbError(err.body?.message ?? err.message);
    }
  }

  /**
   * Publishing makes a type available to file against; archiving withdraws it
   * without touching the records already filed as it.
   */
  /**
   * Puts a job back on the queue. A job that failed because this deployment
   * cannot read the file will fail again the same way, which the message says.
   */
  async function runIngestVerb() {
    const job = selectedRow?.record;
    if (!job?.id) return;
    try {
      await api.processing.retry(job.id);
      source.reload();
    } catch (err) {
      setVerbError(err.body?.message ?? err.message);
    }
  }

  /**
   * Opens whatever document the selected row is about.
   *
   * Four areas list something that stands for a document rather than being
   * one — an approval, an audit entry, a search hit, a pipeline job — so the
   * id is in a different place on each and the verb finds it rather than each
   * area growing its own Open.
   */
  async function openBehindRow() {
    const r = selectedRow?.record;
    const documentId = r?.documentId ?? (r?.resourceType === 'Document' ? r?.resourceId : null) ?? r?.id;
    if (!documentId) {
      setVerbError('There is no document behind this row to open.');
      return;
    }
    try {
      const { url } = await api.documents.content(documentId);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setVerbError(err.body?.message ?? err.message);
    }
  }

  /** Approve or return the selected task (WFL-9). */
  async function runApprovalVerb(verb) {
    if (verb.startsWith('Open')) return openBehindRow();
    const task = selectedRow?.record;
    if (!task?.id) return;
    try {
      await api.workflow.decide(task.id, verb.startsWith('Approve'));
      source.reload();
    } catch (err) {
      setVerbError(err.body?.message ?? err.message);
    }
  }

  /** Copy a link's address, or close it. */
  async function runSharingVerb(verb) {
    const link = selectedRow?.record;
    if (!link?.id) return;
    if (verb.startsWith('Copy')) {
      const url = `${window.location.origin}/s/${link.token}`;
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      return;
    }
    try {
      await api.shares.revoke(link.id);
      source.reload();
    } catch (err) {
      setVerbError(err.body?.message ?? err.message);
    }
  }

  /** Open a form to submissions, or close it. */
  async function runFormVerb(verb) {
    const form = selectedRow?.record;
    if (!form?.id) return;
    try {
      await api.forms.publish(form.id, verb.startsWith('Publish'));
      source.reload();
    } catch (err) {
      setVerbError(err.body?.message ?? err.message);
    }
  }

  /** Suspend somebody, or let them back in. */
  async function runAdminVerb(verb) {
    const person = selectedRow?.record;
    if (!person?.id) return;
    try {
      if (verb.startsWith('Suspend')) await api.users.suspend(person.id);
      else await api.users.reinstate(person.id);
      source.reload();
    } catch (err) {
      setVerbError(err.body?.message ?? err.message);
    }
  }

  async function runTypeVerb(verb) {
    const type = selectedRow?.record;
    if (!type?.id) return;

    const status = verb.startsWith('Publish')
      ? 'PUBLISHED'
      : verb.startsWith('Archive')
        ? 'ARCHIVED'
        : null;
    if (!status) return;

    try {
      await api.documentTypes.setStatus(type.id, status);
      source.reload();
    } catch (err) {
      // The API refuses publishing a type with no fields, which is the whole
      // reason this reports rather than silently doing nothing.
      setVerbError(err.body?.message ?? err.message);
    }
  }

  /**
   * The same actions, applied to everything ticked.
   *
   * Runs one at a time and keeps going after a refusal, because a mixed
   * selection legitimately produces mixed results — three documents move and
   * the fourth is too sensitive for the destination. Reports what failed
   * rather than stopping at the first one and leaving the rest ambiguous.
   */
  async function runBulk(verb) {
    const ids = rows.filter((r) => sel[r[1]] && r.record?.id).map((r) => r.record.id);
    if (ids.length === 0) return;

    if (tab === 'approvals') {
      for (const id of ids) await api.workflow.decide(id, true).catch(() => undefined);
      setSel({});
      source.reload();
      return;
    }

    if (tab === 'sharing') {
      for (const id of ids) await api.shares.revoke(id).catch(() => undefined);
      setSel({});
      source.reload();
      return;
    }

    if (tab === 'ingest') {
      for (const id of ids) await api.processing.retry(id).catch(() => undefined);
      setSel({});
      source.reload();
      return;
    }

    if (tab === 'approvals') {
      for (const id of ids) await api.workflow.decide(id, true).catch(() => undefined);
      setSel({});
      source.reload();
      return;
    }

    if (tab === 'sharing') {
      for (const id of ids) await api.shares.revoke(id).catch(() => undefined);
      setSel({});
      source.reload();
      return;
    }

    if (tab === 'ingest') {
      for (const id of ids) await api.processing.retry(id).catch(() => undefined);
      setSel({});
      source.reload();
      return;
    }

    if (tab === 'types') {
      const status = verb.startsWith('Publish') ? 'PUBLISHED' : verb.startsWith('Archive') ? 'ARCHIVED' : null;
      if (!status) return;
      const failures = [];
      for (const id of ids) {
        try {
          await api.documentTypes.setStatus(id, status);
        } catch (err) {
          failures.push(err.body?.message ?? err.message);
        }
      }
      setSel({});
      source.reload();
      if (failures.length) {
        setVerbError(`${ids.length - failures.length} of ${ids.length} changed. ${failures[0]}`);
      }
      return;
    }

    if (tab !== 'repo') return;

    if (verb.startsWith('Classify') || verb.startsWith('Move')) {
      // Both need a destination, so they go through the same dialog the
      // toolbar uses — applied to the selection rather than the active row.
      setBulkIds(ids);
      setDialog(verb.startsWith('Classify') ? 'classify' : 'move');
      return;
    }

    if (!verb.startsWith('Delete')) return;

    const failures = [];
    for (const id of ids) {
      try {
        await api.documents.remove(id);
      } catch (err) {
        failures.push(err.body?.message ?? err.message);
      }
    }
    setSel({});
    source.reload();
    if (failures.length) {
      setVerbError(
        `${ids.length - failures.length} of ${ids.length} deleted. ${failures[0]}`,
      );
    }
  }

  /* Repository rewrites the breadcrumb's last segment; every other area
     appends the scope, so a search query or batch identity is never lost. */
  const crumbs = useMemo(() => {
    const label = scopeItems[scopeIndex]?.[0] ?? '';

    // With a real tree the handoff's path — Legal / Contracts / 2026 / Vendor —
    // is fiction, and a fabricated breadcrumb above real rows is worse than a
    // short one. Build it from where the folder actually sits instead.
    if (tab === 'repo' && folders.isLive) {
      const depth = scopeItems[scopeIndex]?.[1] ?? 0;
      const trail = [];
      for (let i = scopeIndex - 1; i >= 0 && trail.length < depth; i--) {
        if (scopeItems[i][1] < (trail[0] ? scopeItems[i + 1][1] : depth)) {
          trail.unshift(scopeItems[i][0]);
        }
      }
      return ['Cabinets', ...trail, label];
    }

    const base = CRUMBS[tab].slice();
    if (scope == null) return base;
    if (tab === 'repo') {
      base[base.length - 1] = label;
      return base;
    }
    return [...base, label];
  }, [tab, scope, scopeIndex, scopeItems, folders.isLive]);

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

  return (
    // Above 1180px this is a fixed-minimum-width application that scrolls
    // sideways rather than reflowing, which is what the handoff specifies.
    // Below it, the min-width is dropped and the panes rearrange instead.
    <div className="h-screen overflow-y-hidden overflow-x-auto max-wide:overflow-x-hidden">
      <div className="flex h-screen min-w-wide flex-col bg-desk max-wide:min-w-0">
        <TabStrip
          tabs={TABS}
          active={tab}
          onSelect={goTab}
          // Only the area currently open can report a real total, so that is
          // the only figure overridden. The rest keep the handoff's until they
          // are wired and can speak for themselves.
          counts={source.isLive && source.total != null ? { [tab]: source.total } : undefined}
        />

        <Toolbar
          crumbs={crumbs}
          verbs={toolbarVerbs}
          onVerb={(verb) => {
            const kind = dialogForVerb(tab, scopeIndex, verb);
            if (kind) {
              setDialog(kind);
              return;
            }
            // Verbs that act rather than ask.
            runVerb(verb);
          }}
          findPlaceholder={
            FIND_PLACEHOLDER_BY_SCOPE[tab]?.[scopeIndex] ??
            FIND_PLACEHOLDER[tab] ??
            'Find in this view'
          }
          onOpenScope={() => setScopeOpen(true)}
          scopeLabel={scopeItems[scopeIndex][0]}
          find={find}
          onFind={(v) => {
            setFind(v);
            // A new query means a new result set; staying on row 7 would leave
            // the inspector describing whatever happens to land there.
            setRow(0);
          }}
        />

        <div className="flex min-h-0 flex-1">
          {/* Tapping outside the drawer closes it, the way a drawer should.
              Rendered purely on `scopeOpen` and hidden above the breakpoint by
              a utility, so the 1180px threshold lives in one place rather than
              being duplicated in JS where the two can drift. */}
          {scopeOpen && (
            <button
              type="button"
              aria-label="Close the scope drawer"
              onClick={() => setScopeOpen(false)}
              className="fixed inset-0 z-[35] cursor-pointer border-0 bg-[rgba(26,29,33,0.35)] p-0 wide:hidden"
            />
          )}

          <ScopePane
            heading={scopeDef[0]}
            note={scopeDef[1]}
            items={scopeItems}
            activeIndex={scopeIndex}
            onSelect={goScope}
            open={scopeOpen}
          />

          <ListPane
            area={tab}
            cols={cols}
            rows={rows}
            selectedIndex={row}
            onSelectRow={goRow}
            isPhone={isPhone}
            // One pane at a time on a phone. Decided here rather than in CSS
            // because the shell already tracks which pane is showing.
            hidden={isPhone && mobilePane === 'inspector'}
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
            onBulkVerb={runBulk}
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
            hidden={isPhone && mobilePane === 'list'}
            onBack={() => setMobilePane('list')}
          />
        </div>
        <StatusBar cells={statusCells} />

        {dialog && (
          <CreateDialog
            kind={dialog}
            context={dialogContext}
            onClose={() => {
              setDialog(null);
              setBulkIds(null);
            }}
            onCreated={() => {
              source.reload();
              setSel({});
              // A move or a new folder changes the tree the scope pane draws.
              if (dialog === 'folder' || dialog === 'move') folders.reload();
            }}
          />
        )}

        {/* A refusal from a toolbar verb. Dismissable, and it says what the
            server said rather than "something went wrong". */}
        {verbError && (
          <div
            role="alert"
            className="fixed bottom-10 left-1/2 z-50 flex max-w-[560px] -translate-x-1/2 items-start gap-3 border border-red-border bg-red-bg px-4 py-3 text-detail text-red shadow-menu"
          >
            <span>{verbError}</span>
            <button
              type="button"
              onClick={() => setVerbError(null)}
              className="ml-auto cursor-pointer border-0 bg-transparent font-semibold text-red"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
