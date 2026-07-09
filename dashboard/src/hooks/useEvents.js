import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

/* Recent events plus a realtime subscription to INSERT/UPDATE on public.events,
   so new rows show up without a refresh. */
export function useEvents({ limit = 120 } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .neq("type", "telemetry") // v1 rows; telemetry has its own table now
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!active) return;
      if (error) setError(error.message);
      else setEvents(data || []);
      setLoading(false);
    })();

    const channel = supabase
      .channel("rt-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
        setEvents((prev) => [payload.new, ...prev.filter((e) => e.id !== payload.new.id)].slice(0, limit));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events" }, (payload) => {
        setEvents((prev) => prev.map((e) => (e.id === payload.new.id ? { ...e, ...payload.new } : e)));
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [limit]);

  /* Acknowledge an alert. Only the flag is sent: the server sets
     acknowledged_by and acknowledged_at and writes the audit row. RLS filters
     the row out for viewers, which shows up here as no data and no error. */
  const acknowledge = useCallback(async (id) => {
    const { data, error } = await supabase
      .from("events")
      .update({ acknowledged: true })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return { error };
    if (!data) return { error: { message: "Not allowed. Your role cannot acknowledge alerts." } };
    setEvents((prev) => prev.map((e) => (e.id === id ? data : e)));
    return { data };
  }, []);

  return { events, loading, error, acknowledge };
}
