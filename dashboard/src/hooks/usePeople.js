import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { personKey } from "../lib/format";

/* Tracked people. Fetch plus realtime on public.people, keyed by `id`
   (falls back to node_id:track_id for v1 rows). */
export function usePeople({ limit = 200 } = {}) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const upsert = useCallback((row) => {
    setPeople((prev) => {
      const k = personKey(row);
      const i = prev.findIndex((p) => personKey(p) === k);
      if (i === -1) return [row, ...prev].slice(0, limit);
      const next = prev.slice();
      next[i] = { ...next[i], ...row };
      return next;
    });
  }, [limit]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("people")
        .select("*")
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (!active) return;
      if (error) setError(error.message);
      else setPeople(data || []);
      setLoading(false);
    })();

    const channel = supabase
      .channel("rt-people")
      .on("postgres_changes", { event: "*", schema: "public", table: "people" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const k = personKey(payload.old);
          setPeople((prev) => prev.filter((p) => personKey(p) !== k));
        } else {
          upsert(payload.new);
        }
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [limit, upsert]);

  return { people, loading, error };
}
