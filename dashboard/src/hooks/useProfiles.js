import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

/* All user profiles, for the admin Users page. RLS returns every row to
   admins and only the caller's own row to anyone else. */
export function useProfiles() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    else { setRows(data || []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Change a user's role. The database rejects self-changes and demoting the
     last admin; RLS silently skips the row for non-admins. */
  const setRole = useCallback(async (id, role) => {
    const { data, error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id)
      .select("id, email, role, created_at")
      .maybeSingle();
    if (error) return { error };
    if (!data) return { error: { message: "Not allowed. Only admins can change roles." } };
    setRows((prev) => prev.map((r) => (r.id === id ? data : r)));
    return { data };
  }, []);

  return { rows, loading, error, setRole, reload: load };
}
