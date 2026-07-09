import { Shield, Settings2 } from "lucide-react";

/* Shown when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing, so a new
   clone or deploy says what to set instead of rendering a blank page. */
export default function ConfigNeeded() {
  return (
    <div className="se auth">
      <div className="authcard" style={{ maxWidth: 460 }}>
        <div className="authbrand">
          <div className="bx" aria-hidden="true"><Shield size={20} /></div>
          <div>
            <div className="wordmark" style={{ fontSize: 18 }}>WATCH<b>POST</b></div>
            <div className="lbl" style={{ fontSize: 9 }}>SETUP NEEDED</div>
          </div>
        </div>

        <div className="authmsg err" style={{ display: "flex", gap: 9 }}>
          <Settings2 size={16} style={{ flex: "none", marginTop: 1 }} />
          <span>The Supabase environment variables are not set, so the dashboard
          cannot load any data.</span>
        </div>

        <div style={{ fontSize: 12.5, color: "var(--mid)", lineHeight: 1.6 }}>
          Set these two variables (Supabase: Settings, API), then restart or redeploy:
          <pre style={{
            background: "var(--bg1)", border: "1px solid var(--line2)", borderRadius: 9,
            padding: "11px 12px", marginTop: 10, fontSize: 11.5, color: "var(--cyan)",
            fontFamily: "var(--fm)", overflowX: "auto",
          }}>{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}</pre>
          <div className="dim" style={{ marginTop: 10, fontSize: 11.5 }}>
            Local dev: copy <span className="cyan">.env.example</span> to <span className="cyan">.env.local</span>.
            Vercel or Netlify: add them in the project settings. Use the <b>anon</b> key here, never the service key.
          </div>
        </div>
      </div>
    </div>
  );
}
