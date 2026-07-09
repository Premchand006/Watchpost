import { supabase } from "./supabase";

/* Client-side audit rows for login and logout. Acks, role changes and camera
   or zone edits are written by database triggers. The audit_self_insert policy
   only accepts login/logout rows stamped with the caller's own id.
   A failed audit insert never blocks the sign-in or sign-out itself. */
export async function logAudit(action, detail = {}) {
  if (!supabase) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("audit_log").insert({ user_id: user.id, action, detail });
    if (error) console.warn("audit log failed:", error.message);
  } catch (err) {
    console.warn("audit log failed:", err?.message || err);
  }
}
