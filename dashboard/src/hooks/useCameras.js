import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

/* Cameras and their status (online | offline | tamper). Fetch plus realtime
   on public.cameras, ordered by id so the wall layout stays put. */
export function useCameras() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const upsert = useCallback((row) => {
    setCameras((prev) => {
      const i = prev.findIndex((c) => c.id === row.id);
      if (i === -1) return [...prev, row].sort((a, b) => a.id.localeCompare(b.id));
      const next = prev.slice();
      next[i] = { ...next[i], ...row };
      return next;
    });
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("cameras")
        .select("*")
        .order("id", { ascending: true });
      if (!active) return;
      if (error) setError(error.message);
      else setCameras(data || []);
      setLoading(false);
    })();

    const channel = supabase
      .channel("rt-cameras")
      .on("postgres_changes", { event: "*", schema: "public", table: "cameras" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setCameras((prev) => prev.filter((c) => c.id !== payload.old.id));
        } else {
          upsert(payload.new);
        }
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [upsert]);

  return { cameras, loading, error };
}
