import { createClient } from "@supabase/supabase-js";

/* Browser Supabase client. Uses the anon key only; RLS in Postgres decides
   what each user can read and write (cloud/schema.sql). The service key stays
   on the Pi. */

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Without the env vars the app shows a setup screen instead of failing.
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;
