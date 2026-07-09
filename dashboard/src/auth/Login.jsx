import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Shield, LogIn, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = loc.state?.from?.pathname || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    nav(from, { replace: true });
  }

  return (
    <div className="se auth">
      <form className="authcard" onSubmit={onSubmit}>
        <div className="authbrand">
          <div className="bx" aria-hidden="true"><Shield size={20} /></div>
          <div>
            <div className="wordmark" style={{ fontSize: 18 }}>WATCH<b>POST</b></div>
            <div className="lbl" style={{ fontSize: 9 }}>SIGN IN</div>
          </div>
        </div>

        {err && <div className="authmsg err" role="alert">{err}</div>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" />
        </div>

        <button className="btn" type="submit" disabled={busy}>
          {busy ? <><Loader2 size={15} className="spin" /> Signing in</> : <><LogIn size={15} /> Sign in</>}
        </button>

        <div className="authlink">
          No account? <Link to="/signup">Create one</Link>
        </div>
      </form>
    </div>
  );
}
