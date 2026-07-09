import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { parseTelemetry } from "../lib/telemetry";

/* Edge node health from public.telemetry: last WINDOW rows, then realtime
   INSERTs. Keeps a rolling window for the latency chart and sparklines. */
const WINDOW = 24;

const tail = (arr, v) => [...arr.slice(-(WINDOW - 1)), v];

export function useTelemetry() {
  const [latest, setLatest] = useState(null);
  const [latHistory, setLatHistory] = useState([]); // [{ i, ms }]
  const [hist, setHist] = useState({ cpu: [], temp: [], infer: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ingest = useCallback((snap) => {
    setLatest(snap);
    setLatHistory((prev) => tail(prev, { i: (prev.at(-1)?.i ?? -1) + 1, ms: Math.round(snap.latency) }));
    setHist((h) => ({
      cpu: tail(h.cpu, Math.round(snap.cpu)),
      temp: tail(h.temp, Math.round(snap.temp)),
      infer: tail(h.infer, Math.round(snap.latency)),
    }));
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("telemetry")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(WINDOW);
      if (!active) return;
      if (error) {
        setError(error.message);
      } else {
        const snaps = (data || []).reverse().map(parseTelemetry); // oldest first
        setLatHistory(snaps.map((s, k) => ({ i: k, ms: Math.round(s.latency) })));
        setHist({
          cpu: snaps.map((s) => Math.round(s.cpu)),
          temp: snaps.map((s) => Math.round(s.temp)),
          infer: snaps.map((s) => Math.round(s.latency)),
        });
        if (snaps.length) setLatest(snaps[snaps.length - 1]);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel("rt-telemetry")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telemetry" },
        (payload) => ingest(parseTelemetry(payload.new)))
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [ingest]);

  return { latest, latHistory, hist, loading, error };
}
