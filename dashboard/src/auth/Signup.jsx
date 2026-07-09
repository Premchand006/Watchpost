import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Shield, UserPlus, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { signUp } = useAuth();
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr(""); setOk("");
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    setBusy(true);
    const { error, needsConfirmation } = await signUp(email.trim(), password);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (needsConfirmation) {
      setOk("Account created. Check your email to confirm, then sign in.");
      return;
    }
    nav("/", { replace: true }); // session active immediately (email confirmation off)
  }

  return (
    <div className="se auth">
      <form className="authcard" onSubmit={onSubmit}>
        <div className="authbrand">
          <div className="bx" aria-hidden="true"><Shield size={20} /></div>
          <div>
            <div className="wordmark" style={{ fontSize: 18 }}>WATCH<b>POST</b></div>
            <div className="lbl" style={{ fontSize: 9 }}>CREATE ACCOUNT</div>
          </div>
        </div>

        {err && <div className="authmsg err" role="alert">{err}</div>}
        {ok && <div className="authmsg ok" role="status"><CheckCircle2 size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />{ok}</div>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 6 characters" />
        </div>

        <button className="btn" type="submit" disabled={busy || Boolean(ok)}>
          {busy ? <><Loader2 size={15} className="spin" /> Creating account</> : <><UserPlus size={15} /> Create account</>}
        </button>

        <div className="authlink" style={{ marginTop: 13 }}>
          The first account becomes <span className="cyan">ADMIN</span>. Later accounts start as viewers until an admin changes them.
        </div>
        <div className="authlink">
          Already registered? <Link to="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
