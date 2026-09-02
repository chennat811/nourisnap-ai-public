// supabase/functions/delete-user/index.ts
// Deno Edge Function: delete the currently authenticated user.
// Requires env var SUPABASE_SERVICE_ROLE_KEY set in function secrets.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by the Supabase runtime.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DEBUG = Deno.env.get("DELETE_USER_DEBUG") === "true";

if (!SUPABASE_URL) {
  throw new Error("DELETE_USER_ERROR: SUPABASE_URL is not set");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("DELETE_USER_ERROR: SUPABASE_SERVICE_ROLE_KEY is not set");
}

const ALLOWED_ORIGINS = [
  // The Supabase project URL itself is always allowed.
  SUPABASE_URL,
  // Mobile app custom URL scheme.
  "nourisnap://",
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...getCorsHeaders(origin) },
  });
}

function errorResponse(
  message: string,
  status: number,
  origin: string | null,
  details?: string,
): Response {
  return jsonResponse(
    { error: message, ...(details ? { details } : {}) },
    status,
    origin,
  );
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  try {
    if (DEBUG) console.log("[delete-user] Request received");

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: getCorsHeaders(origin), status: 204 });
    }

    // Only allow POST
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405, origin);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!jwt) {
      return errorResponse("Missing Authorization header", 401, origin);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify the JWT and get the user
    const {
      data: { user },
      error: getUserError,
    } = await admin.auth.getUser(jwt);

    if (getUserError || !user) {
      console.error("[delete-user] getUser failed:", getUserError?.message);
      return errorResponse("Invalid or expired token", 401, origin, getUserError?.message);
    }

    // 1. Find analytics rows for this user so we can clean up storage objects.
    const { data: logs, error: logsErr } = await admin
      .from("ai_call_logs")
      .select("id, image_url")
      .eq("user_id", user.id);

    if (logsErr) {
      console.error("[delete-user] Failed to fetch ai_call_logs:", logsErr.message);
      return errorResponse("Failed to retrieve user data", 500, origin);
    }

    // 2. Delete associated storage objects (best-effort).
    let deletedImages = 0;
    const imagePaths = (logs ?? [])
      .map((log) => log.image_url)
      .filter((path): path is string => typeof path === "string" && path.length > 0);

    if (imagePaths.length > 0) {
      const uniquePaths = [...new Set(imagePaths)];
      const { error: storageErr } = await admin.storage
        .from("food-images")
        .remove(uniquePaths);
      if (storageErr) {
        console.error("[delete-user] Storage cleanup error:", storageErr.message);
      } else {
        deletedImages = uniquePaths.length;
      }
    }

    // 3. Delete analytics rows (no FK on auth.users, so we must delete explicitly).
    const { error: deleteLogsErr } = await admin
      .from("ai_call_logs")
      .delete()
      .eq("user_id", user.id);

    if (deleteLogsErr) {
      console.error("[delete-user] Failed to delete ai_call_logs (best-effort):", deleteLogsErr.message);
      // Continue — auth deletion is the critical operation.
      // Orphaned analytics rows can be cleaned up by a scheduled job.
    }

    // 4. Delete the auth user. DB CASCADE handles food_logs, general_feedback, user_settings.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error("[delete-user] deleteUser error:", delErr.message);
      return errorResponse("Failed to delete user", 500, origin);
    }

    if (DEBUG) {
      console.log("[delete-user] User deleted", {
        userId: user.id,
        analyticsRows: (logs ?? []).length,
        storageObjects: deletedImages,
      });
    }

    return jsonResponse(
      {
        ok: true,
        deleted: {
          authUser: true,
          analyticsRows: (logs ?? []).length,
          storageObjects: deletedImages,
        },
      },
      200,
      origin,
    );
  } catch (e) {
    console.error("[delete-user] unhandled error:", e);
    return errorResponse("Internal error", 500, origin);
  }
});
