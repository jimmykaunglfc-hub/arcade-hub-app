import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase Environment Variables inside .env.local');
}

// The single instance used by the web app and the Capacitor packages.
//
// Social providers return a PKCE authorization code. On the web the global
// callback listener exchanges it after the browser returns; on iOS/Android it
// is exchanged after Capacitor receives the registered deep link.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: false,
  },
});
