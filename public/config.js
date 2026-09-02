/* ============================================================
   Supabase connection details.

   Both values below are PUBLIC by design - the anon key is meant to ship
   inside client-side code, and every request it makes is still gated by the
   Row Level Security policies in supabase/migration_001_sync.sql.

   Never put the service_role key in this file. It bypasses RLS.

   Find these in the Supabase dashboard:
     Project Settings -> Data API -> Project URL
     Project Settings -> API Keys  -> anon / public

   Leave them empty and the app simply runs in local-only mode: tasks are
   still saved in the browser, but the sign-in button is hidden.
   ============================================================ */

window.KTT_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};
