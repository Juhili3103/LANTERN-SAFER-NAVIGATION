/* =====================================================================
   LANTERN — configuration   (THIS is the file you edit)
   ---------------------------------------------------------------------
   Paste your Supabase project URL and PUBLIC key below.

   Where to find them:  Supabase dashboard -> Project Settings -> API
     SUPABASE_URL       "Project URL"      e.g. https://abcdxyzcompany.supabase.co
     SUPABASE_ANON_KEY  the PUBLIC key:
                          - "publishable" key  (starts with sb_publishable_...), or
                          - legacy "anon" key  (a long JWT starting with eyJ...)

   NEVER paste a "secret" key (sb_secret_...) or the "service_role" key
   here. This file is served to every visitor's browser. LANTERN refuses to
   use a secret / service_role key if it detects one.

   The public key is designed to be visible in the browser. What protects
   your data is the Row Level Security policy in supabase/schema.sql.

   Leave both values empty to run in demo mode (synthetic data only).
   ===================================================================== */
window.LANTERN_CONFIG = {
  SUPABASE_URL: 'https://obxxgezlkmvqodzfcdee.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_TVFuWE8cgof7ogfmtsotLA_kTWOAWpB'
};
