import { supabase } from "../lib/supabase";

export class NotAuthError extends Error {
  constructor(message = "NOT_AUTH") {
    super(message);
    this.name = "NotAuthError";
  }
}

export async function withAuth<T>(fn: () => Promise<T>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) throw new NotAuthError();

  let result: T;
  try {
    result = await fn();
  } catch (e: any) {
    return handleAuthError(e, fn);
  }

  // Supabase responses return { data, error } instead of throwing.
  // Check if result has an error property that looks like an auth error.
  if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
    const err = (result as any).error;
    const msg = String(err?.message || "");
    if (err?.status === 401 || err?.code === '42501' || /jwt|auth|token/i.test(msg) || /row-level security/i.test(msg)) {
      return handleAuthError(err, fn);
    }
  }

  return result;
}

async function handleAuthError<T>(e: any, fn: () => Promise<T>): Promise<T> {
  const msg = String(e?.message || "");
  if (e?.status === 401 || /jwt|auth|token/i.test(msg) || e?.code === '42501' || /row-level security/i.test(msg)) {
    // Re-fetch session once; supabase-js refreshes automatically if possible
    const { data: again } = await supabase.auth.getSession();
    if (!again?.session) throw new NotAuthError();
    // Retry once
    return await fn();
  }
  throw e;
}
