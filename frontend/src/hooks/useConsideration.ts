import { useCallback, useEffect, useState } from "react";

import {
  addToConsideration,
  getConsideration,
  removeFromConsideration,
} from "../services/api";
import type { ConsiderationItem } from "../types";

export interface UseConsiderationReturn {
  items: ConsiderationItem[];
  siteIds: Set<string>;
  loading: boolean;
  error: string | null;
  isInConsideration: (siteId: string) => boolean;
  add: (siteId: string) => Promise<void>;
  remove: (siteId: string) => Promise<void>;
}

/** Fetches and manages the authenticated planner's site shortlist.
 *
 * Designed to be mounted once at the layout level (PlannerLayout) so that the
 * shortlist count in the Sidebar and the "Add to consideration" buttons in
 * Site Explorer and Site Details all share a single source of truth without
 * prop-drilling. Pass this hook's return value via React context. */
export function useConsideration(): UseConsiderationReturn {
  const [items, setItems] = useState<ConsiderationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getConsideration()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load consideration list");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const siteIds = new Set(items.map((i) => i.site_id));

  const isInConsideration = useCallback(
    (siteId: string) => siteIds.has(siteId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  const add = useCallback(async (siteId: string) => {
    // Optimistic update
    const tempItem: ConsiderationItem = {
      id: `temp-${siteId}`,
      site_id: siteId,
      added_at: new Date().toISOString(),
    };
    setItems((prev) => (prev.some((i) => i.site_id === siteId) ? prev : [...prev, tempItem]));
    try {
      const real = await addToConsideration(siteId);
      setItems((prev) => prev.map((i) => (i.site_id === siteId ? real : i)));
    } catch {
      // Rollback
      setItems((prev) => prev.filter((i) => i.site_id !== siteId));
    }
  }, []);

  const remove = useCallback(async (siteId: string) => {
    // Optimistic update
    setItems((prev) => prev.filter((i) => i.site_id !== siteId));
    try {
      await removeFromConsideration(siteId);
    } catch {
      // Rollback — re-fetch to get accurate state
      getConsideration()
        .then(setItems)
        .catch(() => undefined);
    }
  }, []);

  return { items, siteIds, loading, error, isInConsideration, add, remove };
}
