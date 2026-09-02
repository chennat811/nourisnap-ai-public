import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL as ENV_SUPABASE_URL,
  SUPABASE_ANON_KEY as ENV_SUPABASE_ANON_KEY,
} from "@env";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

// Prefer runtime config from app.json extra (Expo Go/dev client) or Updates.manifest.extra (EAS production),
// then fallback to @env (injected at build time by react-native-dotenv)
const manifestExtra = (Updates as any)?.manifest?.extra ?? undefined;
const extra = ((Constants.expoConfig?.extra as any) ?? manifestExtra ?? {}) as any;
const SUPABASE_URL: string | undefined = extra?.supabaseUrl ?? ENV_SUPABASE_URL;
const SUPABASE_ANON_KEY: string | undefined =
  extra?.supabaseAnonKey ?? ENV_SUPABASE_ANON_KEY;
const SUPABASE_FUNCTION_URL: string | undefined =
  extra?.supabaseFunctionUrl ?? (process as any)?.env?.EXPO_PUBLIC_SUPABASE_FUNCTION_URL ?? undefined;

if (!SUPABASE_URL)
  console.error(
    "SUPABASE_URL is not defined (check app.json extra.supabaseUrl or .env)",
  );
if (!SUPABASE_ANON_KEY)
  console.error(
    "SUPABASE_ANON_KEY is not defined (check app.json extra.supabaseAnonKey or .env)",
  );

// Optional lightweight check (kept concise)
try {
  if (SUPABASE_URL) {
    const host = new URL(SUPABASE_URL).host;
    // Minimal one-time info to confirm config; comment out to silence completely
    // console.info('[Supabase] Using host:', host);
  }
} catch {}

export const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
    storage: AsyncStorage,
    debug: false, // turn off verbose GoTrueClient logs
  },
});

// If a custom Functions base URL is provided, apply it at runtime
try {
  if (SUPABASE_FUNCTION_URL) {
    // @ts-expect-error: setURL exists on Functions client in supabase-js v2
    supabase.functions.setURL(SUPABASE_FUNCTION_URL);
  }
} catch {}
