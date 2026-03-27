import { createClient } from '@supabase/supabase-js';

// Server-only Supabase client using the service role key.
// Ensure SUPABASE_SERVICE_ROLE_KEY is set in the environment (.env.local) and never expose this key to the browser.
const serviceSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

export default serviceSupabase;
