import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';
import { SCOPES } from '../data/areas.js';

/**
 * The Repository's cabinet list, from the real folder tree.
 *
 * The scope pane speaks in `[label, depth, count]` tuples, and the API returns
 * a nested tree, so the tree is flattened depth-first — which is also the order
 * a person reads it in: a folder appears directly beneath its parent.
 *
 * A parallel array of ids comes back alongside, because selecting scope N has
 * to become "show me the documents in folder X". Keeping them in step by index
 * is what lets ScopePane stay ignorant of folders entirely.
 *
 * Falls back to the handoff's sample cabinets if the call fails, so a dropped
 * connection degrades to the old screen rather than an empty pane.
 */
export function useFolderScopes(enabled = true) {
  const [state, setState] = useState({
    items: null,
    ids: [],
    loading: enabled,
    error: null,
  });

  const load = useCallback(async (signal) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const tree = await api.folders.tree();
      if (signal?.aborted) return;

      const items = [];
      const ids = [];

      const walk = (nodes, depth) => {
        for (const f of nodes) {
          // No document count: the tree endpoint does not carry one, and a
          // guessed figure beside a real folder name is worse than none.
          items.push([f.name, depth, '']);
          ids.push(f.id);
          if (f.children?.length) walk(f.children, depth + 1);
        }
      };
      walk(tree, 0);

      setState({ items, ids, loading: false, error: null });
    } catch (err) {
      if (signal?.aborted) return;
      setState({ items: null, ids: [], loading: false, error: err });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, enabled]);

  const isLive = Array.isArray(state.items) && state.items.length > 0;

  return {
    // SCOPES[..][2] is the sample cabinet list; used until the real one lands.
    items: isLive ? state.items : SCOPES.repo[2],
    ids: state.ids,
    isLive,
    loading: state.loading,
    error: state.error,
    reload: () => load(),
  };
}
