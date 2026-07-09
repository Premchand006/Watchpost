import { useState } from "react";
import { UserCog } from "lucide-react";
import { Loading, Empty, ErrorState } from "../components/states";
import { useProfiles } from "../hooks/useProfiles";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ROLES, ROLE_LABEL } from "../lib/constants";

/* Users (admins only). Lists every profile and lets an admin change roles.
   The database enforces the rules: only admins can change roles, nobody can
   change their own, and the last admin cannot be demoted. Errors come back
   as toasts. */
export default function UsersView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { rows, loading, error, setRole } = useProfiles();
  const [busy, setBusy] = useState(null);

  async function onChange(row, role) {
    if (role === row.role) return;
    setBusy(row.id);
    const { error } = await setRole(row.id, role);
    setBusy(null);
    if (error) toast(error.message, "error");
    else toast(`${row.email || "User"} is now ${ROLE_LABEL[role].toLowerCase()}.`, "success");
  }

  return (
    <div className="panel">
      <div className="ph"><UserCog size={14} className="cyan" /><span className="t">Users</span>
        <span className="r">{rows.length} accounts</span></div>
      <div className="trackside">
        {loading ? <Loading label="Loading users…" />
          : error ? <ErrorState message={error} />
          : rows.length ? rows.map((r) => {
            const self = r.id === user?.id;
            return (
              <div className="tk userrow" key={r.id}>
                <span className="useremail">{r.email || r.id}</span>
                {self && <span className="tagdot bg-info">you</span>}
                <span className="spacer" />
                <span className="dim hide-sm" style={{ fontSize: 10.5 }}>
                  joined {r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}
                </span>
                <label className="sr-only" htmlFor={`role-${r.id}`}>Role for {r.email || r.id}</label>
                <select id={`role-${r.id}`} className="roleselect" value={r.role}
                  disabled={self || busy === r.id}
                  title={self ? "You cannot change your own role" : undefined}
                  onChange={(e) => onChange(r, e.target.value)}>
                  {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                </select>
              </div>
            );
          }) : <Empty title="No users" hint="Accounts appear here after they sign up." icon={UserCog} />}
      </div>
      <div className="pb dim" style={{ fontSize: 11, borderTop: "1px solid var(--line)" }}>
        Officers can acknowledge alerts. Viewers have read-only access. New accounts start as viewers.
      </div>
    </div>
  );
}
