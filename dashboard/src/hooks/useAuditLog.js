import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/* Audit log rows for the admin page. RLS (audit_admin_read) returns rows to
   admins only; anyone else gets an empty list. */
export function useAuditLog({ limit = 100 } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!active) return;
      if (error) setError(error.message);
      else setRows(data || []);
      setLoading(false);
    })();

    // audit_log is not in the realtime publication, so poll every 15 s.
    const t = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (active && data) setRows(data);
    }, 15000);

    return () => { active = false; clearInterval(t); };
  }, [limit]);

  return { rows, loading, error };
}
