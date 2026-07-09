import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logAudit } from "../lib/audit";

/* Session, profile and role for the whole app, plus sign in/up/out.
   The role here only drives what the UI shows. RLS decides what the server allows. */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // { id, email, role }
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role")
      .eq("id", userId)
      .maybeSingle();
    if (error) console.warn("profile load failed:", error.message);
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      await loadProfile(session?.user?.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      await loadProfile(session?.user?.id);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    await logAudit("login", { email });
    return { data };
  }, []);

  const signUp = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    return { data, needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await logAudit("logout", { email: session?.user?.email });
    await supabase.auth.signOut();
    setProfile(null);
  }, [session?.user?.email]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
