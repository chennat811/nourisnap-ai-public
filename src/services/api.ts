import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";
import { FoodAnalysis, FoodItem } from "../types/analysis";

// API_BASE_URL is now sourced solely from .env using react-native-dotenv (@env)
import { SUPABASE_URL } from "@env";

if (__DEV__) {
  try {
    const host = new URL(SUPABASE_URL).host;
    // Safe: do not log keys or tokens
    console.log("[DEBUG] Supabase host:", host);
    console.log("[DEBUG] Using supabase.functions.invoke for Edge Functions");
  } catch {}
}

// Detect a daily scan limit error from the edge function response by reading
// the stable `code` field instead of the localized message string.
async function extractDailyLimitError(error: any): Promise<Error | null> {
  if (!error) return null;

  if (error.code === "DAILY_LIMIT_REACHED") {
    const limitError = new Error("Daily scan limit reached");
    (limitError as any).code = "DAILY_LIMIT_REACHED";
    return limitError;
  }

  const message = String(error.message || error.msg || "");
  if (
    message.includes("DAILY_LIMIT_REACHED") ||
    message.includes("[Quota] Daily limit reached")
  ) {
    const limitError = new Error("Daily scan limit reached");
    (limitError as any).code = "DAILY_LIMIT_REACHED";
    return limitError;
  }

  const jsonFn = error.json || error.context?.json;
  if (typeof jsonFn === "function") {
    try {
      const body = await jsonFn.call(error.context ?? error);
      if (body?.code === "DAILY_LIMIT_REACHED") {
        const limitError = new Error("Daily scan limit reached");
        (limitError as any).code = "DAILY_LIMIT_REACHED";
        return limitError;
      }
    } catch {
      // Body is not JSON or already consumed; ignore.
    }
  }

  return null;
}

// =========================
// Response parsing helpers
// =========================

function sanitizeJsonish(input: string): string {
  let s = String(input || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.replace(/,\s*([}\]])/g, "$1");
}

function parseFencedJson(input: string): unknown {
  try {
    return JSON.parse(sanitizeJsonish(input));
  } catch {
    return { raw: input };
  }
}

function parseAnalysisPayload(payload: unknown): FoodAnalysis {
  let p: any = payload;
  if (typeof p === "string") {
    try {
      p = JSON.parse(p);
    } catch {
      return { raw: p } as any;
    }
  }
  if (!p || typeof p !== "object") return p as FoodAnalysis;

  const extras = {
    title_en: p.title_en || null,
    title_zh: p.title_zh || null,
    breakdown_en: p.breakdown_en || null,
    breakdown_zh: p.breakdown_zh || null,
  };

  if (typeof p.analysis === "string") {
    return {
      ...(parseFencedJson(p.analysis) as Record<string, unknown>),
      ...extras,
    } as FoodAnalysis;
  }
  if (typeof p.analysis === "object") {
    return { ...(p.analysis as Record<string, unknown>), ...extras } as FoodAnalysis;
  }
  if (p.breakdown && typeof p.breakdown === "object") {
    return { ...(p.breakdown as Record<string, unknown>), ...extras } as FoodAnalysis;
  }
  if (typeof p.response === "string") {
    return {
      ...(parseFencedJson(p.response) as Record<string, unknown>),
      ...extras,
    } as FoodAnalysis;
  }
  return p as FoodAnalysis;
}

function wrapFunctionError(error: any): Error {
  if (!error) return error;
  const name = String(error.name || "");
  const message = String(error.message || error.msg || "").toLowerCase();
  const isNetworkLike =
    name === "TimeoutError" ||
    name === "FunctionsFetchError" ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("failed to send a request") ||
    message.includes("network");
  if (isNetworkLike) {
    const networkError = new Error(
      "Please check your internet connection and try again.",
    );
    (networkError as any).code = "NETWORK_ERROR";
    (networkError as any).originalError = error;
    return networkError;
  }
  return error;
}

// Shared in-memory cache for daily calorie totals, accessible across screens
const _historyTotalsCache: Record<string, number> = {};

export const classifyTextInput = async (
  accessToken: string | undefined,
  query: string,
): Promise<{
  food_type: "dish" | "drink" | "packaged";
  suspected_substance: "alcohol" | "drugs" | "none";
  substance_confidence: "high" | "medium" | "low";
}> => {
  const { data, error } = await supabase.functions.invoke("openai", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: { query, mode: "classify_text" },
    timeout: 15000,
  });
  if (error) throw wrapFunctionError(error);
  return data;
};

// Text-only re-breakdown: decompose dish_name + total weight + component names
// into weighted items_detailed using GPT-4o-mini (no image needed).
export const textRebreakdown = async (
  accessToken: string | undefined,
  opts: {
    dish_name: string;
    total_weight_g?: number | null;
    total_volume_ml?: number | null;
    components?: string[];
    is_drink?: boolean;
    confirmed_substance?: "alcohol" | "drugs";
    excluded_substance?: "alcohol" | "drugs";
    language?: string;
    adminBypass?: boolean;
    signal?: AbortSignal;
  },
): Promise<{
  dish_name?: string;
  food_breakdown: string;
  items?: string[];
  items_detailed?: Array<{
    name: string;
    grams_g: number | null;
    volume_ml?: number | null;
    confidence?: number | null;
    is_garnish?: boolean;
  }>;
  is_drink?: boolean | null;
  portion_confidence?: string;
  notes?: string | null;
}> => {
  const { data: json, error } = await supabase.functions.invoke("openai", {
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: {
      query: opts.dish_name,
      mode: "rebreakdown",
      language: opts.language || undefined,
      admin_bypass: opts.adminBypass || undefined,
      food_breakdown: JSON.stringify({
        dish_name: opts.dish_name,
        total_weight_g: opts.total_weight_g ?? undefined,
        total_volume_ml: opts.total_volume_ml ?? undefined,
        components: opts.components ?? [],
        is_drink: opts.is_drink,
        confirmed_substance: opts.confirmed_substance ?? undefined,
        excluded_substance: opts.excluded_substance ?? undefined,
      }),
    },
    timeout: 20000, // 20s
    signal: opts.signal,
  });
  if (error) {
    const limitError = await extractDailyLimitError(error);
    if (limitError) throw limitError;
    throw wrapFunctionError(error);
  }
  const bd = json?.breakdown ?? json;
  return {
    dish_name: bd?.dish_name ? String(bd.dish_name) : undefined,
    food_breakdown: String(bd?.food_breakdown || ""),
    items: Array.isArray(bd?.items) ? bd.items : undefined,
    items_detailed: Array.isArray(bd?.items_detailed) ? bd.items_detailed : undefined,
    is_drink: typeof bd?.is_drink === "boolean" ? bd.is_drink : null,
    portion_confidence: typeof bd?.portion_confidence === "string" ? bd.portion_confidence : undefined,
    notes: typeof bd?.notes === "string" ? bd.notes : null,
  };
};

// Text-only analysis (no image required)
export const sendTextPromptToOpenAI = async (
  accessToken: string | undefined,
  opts: {
    query: string;
    portion?: number;
    servings?: number;
    foodBreakdown?: string;
    sugarLevel?: number;
    drinkType?: "creamer" | "fresh_milk" | "pure_tea" | "fruit";
    confirmedSubstance?: "alcohol" | "drugs" | null;
    language?: string;
    adminBypass?: boolean;
    signal?: AbortSignal;
  },
): Promise<FoodAnalysis> => {
  const { data: json, error } = await supabase.functions.invoke("openai", {
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: {
      query: opts.query,
      portion: typeof opts.portion === "number" ? opts.portion : undefined,
      servings: typeof opts.servings === "number" ? opts.servings : undefined,
      mode: "analysis",
      food_breakdown: opts.foodBreakdown || undefined,
      sugar_level:
        typeof opts.sugarLevel === "number" ? opts.sugarLevel : undefined,
      drink_type: opts.drinkType || undefined,
      confirmed_substance:
        opts.confirmedSubstance === "alcohol" || opts.confirmedSubstance === "drugs"
          ? opts.confirmedSubstance
          : undefined,
      language: opts.language || undefined,
      admin_bypass: opts.adminBypass || undefined,
    },
    timeout: 20000, // 20s
    signal: opts.signal,
  });

  if (error) {
    const limitError = await extractDailyLimitError(error);
    if (limitError) throw limitError;
    throw wrapFunctionError(error);
  }

  // Defensive: supabase may return the body as a string, or the edge function
  // may wrap the payload under `analysis` or `response`.
  return parseAnalysisPayload(json);
};
// AsyncStorage flags used to signal screens to re-fetch on focus
export const HISTORY_DAY_REFRESH_FLAG = "history_day_needs_refresh";
export const HISTORY_DATES_REFRESH_FLAG = "history_dates_needs_refresh";
export const DASHBOARD_REFRESH_FLAG = "dashboard_needs_refresh";

export function historyTotalsKey(user_id: string, dateISO: string) {
  return `${user_id}:${dateISO}`;
}
export function historyTotalsGet(key: string) {
  return _historyTotalsCache[key];
}
export function historyTotalsSet(key: string, total: number) {
  _historyTotalsCache[key] = total;
}
export function historyTotalsIncrement(key: string, delta: number) {
  const prev = _historyTotalsCache[key] ?? 0;
  _historyTotalsCache[key] = prev + (delta || 0);
}
export function historyTotalsClearAll() {
  for (const k of Object.keys(_historyTotalsCache)) {
    delete _historyTotalsCache[k];
  }
}

// =========================
// Date helpers
// =========================

function toLocalDateISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toUTCDateISO(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// =========================
// User Settings: Types & Cache
// =========================

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type GoalType = "maintain" | "lose" | "gain";
export type SexType = "male" | "female";

export type UserSettingsRecord = {
  id: string;
  user_id: string;
  age: number | null;
  sex: SexType | null;
  weight_kg: number | null;
  height_cm: number | null;
  activity_level: ActivityLevel | null;
  goal: GoalType | null;
  calorie_target: number | null;
  protein_target_g: number | null;
  carb_target_g: number | null;
  fat_target_g: number | null;
  sodium_target_mg: number | null;
  sugar_target_g: number | null;
  fiber_target_g: number | null;
  data_collection_consent: boolean | null;
  updated_at: string | null;
};

export type UserSettingsInput = {
  age: number;
  sex: SexType;
  weight_kg: number;
  height_cm: number;
  activity_level: ActivityLevel;
  goal: GoalType;
  // Optional manual overrides
  calorie_target?: number;
  protein_target_g?: number;
  carb_target_g?: number;
  fat_target_g?: number;
  sodium_target_mg?: number;
  sugar_target_g?: number;
  fiber_target_g?: number;
};

// In-memory settings cache
const _userSettingsMem: Record<string, UserSettingsRecord> = {};
const userSettingsKey = (user_id: string) => `user_settings:${user_id}`;

// =========================
// Calculation helpers (Mifflin–St Jeor)
// =========================

function computeBMR(params: {
  sex: SexType;
  weight_kg: number;
  height_cm: number;
  age: number;
}): number {
  const { sex, weight_kg, height_cm, age } = params;
  const bmr =
    10 * weight_kg + 6.25 * height_cm - 5 * age + (sex === "male" ? 5 : -161);
  return Math.max(500, Math.round(bmr));
}

function activityMultiplier(level: ActivityLevel): number {
  switch (level) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "active":
      return 1.725;
    case "very_active":
      return 1.9;
    default:
      return 1.2;
  }
}

function goalMultiplier(goal: GoalType): number {
  switch (goal) {
    case "maintain":
      return 1.0;
    case "lose":
      return 0.85; // ~15% deficit
    case "gain":
      return 1.1; // ~10% surplus
    default:
      return 1.0;
  }
}

export function computeTargetsFromProfile(
  input: Omit<
    UserSettingsInput,
    "calorie_target" | "protein_target_g" | "carb_target_g" | "fat_target_g"
  >,
  macroSplit: { proteinPct: number; carbPct: number; fatPct: number } = {
    proteinPct: 0.3,
    carbPct: 0.4,
    fatPct: 0.3,
  },
): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg: number;
  sugar_g: number;
  fiber_g: number;
} {
  const bmr = computeBMR({
    sex: input.sex,
    weight_kg: input.weight_kg,
    height_cm: input.height_cm,
    age: input.age,
  });
  const tdee =
    bmr * activityMultiplier(input.activity_level) * goalMultiplier(input.goal);
  const calories = Math.max(1000, Math.round(tdee));
  const protein_g = Math.round((calories * macroSplit.proteinPct) / 4);
  const carbs_g = Math.round((calories * macroSplit.carbPct) / 4);
  const fat_g = Math.round((calories * macroSplit.fatPct) / 9);

  // Standard recommendations
  const sodium_mg = 2300; // General recommendation
  const sugar_g = Math.round((calories * 0.1) / 4); // < 10% of calories
  const fiber_g = Math.round((calories / 1000) * 14); // ~14g per 1000 kcal

  return { calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g };
}

// =========================
// Supabase I/O + Caching
// =========================

async function getUserSettings(
  user_id: string,
): Promise<UserSettingsRecord | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as UserSettingsRecord) ?? null;
}

export async function upsertUserSettings(
  user_id: string,
  input: UserSettingsInput,
): Promise<UserSettingsRecord> {
  // If overrides are not provided, compute defaults
  const computed = computeTargetsFromProfile({
    age: input.age,
    sex: input.sex,
    weight_kg: input.weight_kg,
    height_cm: input.height_cm,
    activity_level: input.activity_level,
    goal: input.goal,
  });
  const payload = {
    user_id,
    age: input.age,
    sex: input.sex,
    weight_kg: input.weight_kg,
    height_cm: input.height_cm,
    activity_level: input.activity_level,
    goal: input.goal,
    calorie_target: input.calorie_target ?? computed.calories,
    protein_target_g: input.protein_target_g ?? computed.protein_g,
    carb_target_g: input.carb_target_g ?? computed.carbs_g,
    fat_target_g: input.fat_target_g ?? computed.fat_g,
    sodium_target_mg: input.sodium_target_mg ?? computed.sodium_mg,
    sugar_target_g: input.sugar_target_g ?? computed.sugar_g,
    fiber_target_g: input.fiber_target_g ?? computed.fiber_g,
  } as const;

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  if (error) throw error;

  const record = data as unknown as UserSettingsRecord;
  // Update caches
  _userSettingsMem[user_id] = record;
  try {
    await AsyncStorage.setItem(
      userSettingsKey(user_id),
      JSON.stringify(record),
    );
  } catch {}
  return record;
}

export async function getUserSettingsCached(
  user_id: string,
  opts?: { refresh?: boolean },
): Promise<UserSettingsRecord | null> {
  if (!opts?.refresh && _userSettingsMem[user_id])
    return _userSettingsMem[user_id];

  if (!opts?.refresh) {
    try {
      const s = await AsyncStorage.getItem(userSettingsKey(user_id));
      if (s) {
        const parsed = JSON.parse(s) as UserSettingsRecord;
        _userSettingsMem[user_id] = parsed;
        return parsed;
      }
    } catch {}
  }

  const fresh = await getUserSettings(user_id);
  if (fresh) {
    _userSettingsMem[user_id] = fresh;
    try {
      await AsyncStorage.setItem(
        userSettingsKey(user_id),
        JSON.stringify(fresh),
      );
    } catch {}
  }
  return fresh;
}

export async function invalidateUserSettingsCache(user_id: string) {
  delete _userSettingsMem[user_id];
  try {
    await AsyncStorage.removeItem(userSettingsKey(user_id));
  } catch {}
}

export function invalidateAllUserSettingsCache() {
  for (const key of Object.keys(_userSettingsMem)) {
    delete _userSettingsMem[key];
  }
}

export function clearAllInMemoryCaches() {
  historyTotalsClearAll();
  invalidateAllUserSettingsCache();
}

async function ensureLocalImage(uri: string): Promise<string> {
  if (!uri.startsWith("http://") && !uri.startsWith("https://")) return uri;
  if (!FileSystem.cacheDirectory) {
    throw new Error("Cache directory unavailable");
  }
  const base = FileSystem.cacheDirectory.replace(/\/?$/, "/");
  const dest = `${base}remote_${Date.now()}.jpg`;
  const result = await FileSystem.downloadAsync(uri, dest);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Remote image download failed: ${result.status}`);
  }
  return result.uri || dest;
}

/**
 * Sends a photo as a base64-encoded string to the Supabase Edge Function for OpenAI processing.
 * GPT-4o is the primary model; Gemini is used as a server-side fallback.
 * @param photoUri URI to the local photo file or remote image URL
 * @param accessToken (optional) User's JWT for authenticated requests
 * @param opts (optional) Options object with a 'portion' property to scale estimates
 */
export const sendPhotoBase64ToOpenAI = async (
  photoUri: string,
  accessToken?: string,
  opts?: {
    portion?: number;
    query?: string;
    servings?: number;
    mode?: "breakdown" | "full" | "analysis" | "single_pass";
    foodBreakdown?: string;
    sugarLevel?: number;
    foodType?: "drink" | "dish" | "packaged";
    drinkType?: "creamer" | "fresh_milk" | "pure_tea" | "fruit";
    confirmedSubstance?: "alcohol" | "drugs" | null;
    language?: string;
    adminBypass?: boolean;
    signal?: AbortSignal;
  },
): Promise<FoodAnalysis> => {
  let downloadedUri: string | undefined;
  let resizedUri: string | undefined;
  let processedUri = photoUri;

  try {
    // Support remote `https://` storage URLs (e.g., re-analyzing an old log)
    // by downloading them to a temporary cache file first.
    const sourceUri = await ensureLocalImage(photoUri);
    downloadedUri = sourceUri !== photoUri ? sourceUri : undefined;
    processedUri = sourceUri;

    // Single-pass resize: scale shorter side to 512px, preserve aspect ratio
    try {
      const resized = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: 512 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      resizedUri = resized.uri;
      processedUri = resized.uri;
    } catch (e) {
      if (__DEV__)
        console.warn(
          "[sendPhotoBase64ToOpenAI] Resize failed, using source image",
          e,
        );
    }

    // Read file as base64 string
    const base64 = await FileSystem.readAsStringAsync(processedUri, {
      encoding: "base64" as any,
    });

    const { data: json, error } = await supabase.functions.invoke("openai", {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: {
        image_base64: base64,
        filename: "meal.jpg",
        mimetype: "image/jpeg",
        portion: typeof opts?.portion === "number" ? opts.portion : undefined,
        query: opts?.query || undefined,
        servings:
          typeof opts?.servings === "number" ? opts.servings : undefined,
        mode: opts?.mode || undefined,
        food_breakdown: opts?.foodBreakdown || undefined,
        sugar_level:
          typeof opts?.sugarLevel === "number" ? opts.sugarLevel : undefined,
        food_type: opts?.foodType || undefined,
        drink_type: opts?.drinkType || undefined,
        confirmed_substance:
          opts?.confirmedSubstance === "alcohol" || opts?.confirmedSubstance === "drugs"
            ? opts.confirmedSubstance
            : undefined,
        language: opts?.language || undefined,
        admin_bypass: opts?.adminBypass || undefined,
      },
      timeout: 20000, // 20s
      signal: opts?.signal,
    });

    if (error) {
      if (__DEV__)
        console.error("[sendPhotoBase64ToOpenAI] invoke error:", error);
      const limitError = await extractDailyLimitError(error);
      if (limitError) throw limitError;
      throw wrapFunctionError(error);
    }

    // Prefer the normalized 'analysis' object from the Edge Function.
    // Also include language-specific fields if present.
    // Defensive: supabase may return the body as a string.
    return parseAnalysisPayload(json);
  } finally {
    const cleanup = async (uri?: string) => {
      if (!uri || uri === photoUri) return;
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {}
    };
    await cleanup(resizedUri);
    await cleanup(downloadedUri);
  }
};

export async function addFoodLogWithDetails({
  user_id,
  image_url,
  foodItem,
  meal_type,
  recordedDateISO,
  idempotency_key,
  title_en,
  title_zh,
  breakdown_en,
  breakdown_zh,
}: {
  user_id: string;
  image_url?: string | null;
  foodItem: {
    calories: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
    sodium_mg?: number;
    sugar_g?: number;
    fiber_g?: number;
    food_breakdown: string;
    tip_or_fact: string;
    suggestion: string;
    title?: string | null;
    health_score?: number;
    health_recommendation?: string;
  };
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack";
  recordedDateISO?: string; // YYYY-MM-DD of when the meal was actually eaten
  idempotency_key?: string;
  title_en?: string | null;
  title_zh?: string | null;
  breakdown_en?: string | null;
  breakdown_zh?: string | null;
}): Promise<HistoryLogItem> {
  // Ensure we always set a logical recorded date (YYYY-MM-DD)
  const fallbackTodayISO = toLocalDateISO(new Date());
  const recorded_for_date = recordedDateISO ?? fallbackTodayISO;
  // Provide a stable default idempotency key if not provided by caller.
  // For photo logs, the image_url is a natural de-duplicator.
  // For text-only logs, we use a timestamp to avoid overwriting multiple entries on the same day.
  const idemp =
    idempotency_key ?? 
    (image_url 
      ? `${user_id}|${recorded_for_date}|${image_url}` 
      : `${user_id}|${recorded_for_date}|text|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`);
  const { data, error } = await supabase
    .from("food_logs")
    .upsert(
      [
        {
          user_id,
          image_url,
          meal_type,
          recorded_for_date,
          idempotency_key: idemp,
          // Real columns
          calories: foodItem.calories,
          protein_g: foodItem.protein_g,
          carbs_g: foodItem.carbs_g,
          fat_g: foodItem.fat_g,
          sodium_mg: foodItem.sodium_mg ?? 0,
          sugar_g: foodItem.sugar_g ?? 0,
          fiber_g: foodItem.fiber_g ?? 0,
          title: foodItem.title ?? null,
          health_score: foodItem.health_score ?? null,
          health_recommendation: foodItem.health_recommendation ?? null,
          // Translation fields
          title_en: title_en ?? null,
          title_zh: title_zh ?? null,
          breakdown_en: breakdown_en ?? null,
          breakdown_zh: breakdown_zh ?? null,
          // Keep only AI text fields in JSON (no numeric duplication)
          food_json: {
            food_breakdown: foodItem.food_breakdown,
            tip_or_fact: foodItem.tip_or_fact,
            suggestion: foodItem.suggestion,
            title: foodItem.title ?? null,
          },
        },
      ],
      { onConflict: "idempotency_key" },
    )
    .select(
      "id, created_at, recorded_for_date, image_url, meal_type, title, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g, health_score, health_recommendation, title_en, title_zh, breakdown_en, breakdown_zh",
    )
    .maybeSingle();
  if (error) throw error;
  return data as unknown as HistoryLogItem;
}

export async function saveFoodLogEditTracking({
  user_id,
  log_id,
  edit_tracking,
}: {
  user_id: string;
  log_id: string;
  edit_tracking: Record<string, unknown>;
}): Promise<void> {
  const { data, error } = await supabase
    .from("food_logs")
    .select("food_json")
    .eq("user_id", user_id)
    .eq("id", log_id)
    .maybeSingle();
  if (error) throw error;

  const existing = (data as any)?.food_json || {};
  const existingEdit = ((existing as any)?.edit_tracking || {}) as Record<
    string,
    unknown
  >;
  const mergedEdit = {
    ...existingEdit,
    ...edit_tracking,
  } as Record<string, unknown>;

  // Don't erase a previously recorded edited timestamp.
  if (mergedEdit.edited_at == null && existingEdit.edited_at != null) {
    mergedEdit.edited_at = existingEdit.edited_at;
  }

  const merged = {
    ...existing,
    edit_tracking: mergedEdit,
  };

  const { error: updateError } = await supabase
    .from("food_logs")
    .update({ food_json: merged })
    .eq("user_id", user_id)
    .eq("id", log_id);
  if (updateError) throw updateError;
}

export async function getMealCaloriesForDate(
  user_id: string,
  date: Date,
): Promise<Record<"breakfast" | "lunch" | "dinner" | "snack", number>> {
  // Use LOCAL date string to match History screens and visible dates
  const dateISO = toLocalDateISO(date);
  const { data, error } = await supabase
    .from("food_logs")
    .select("meal_type, calories, recorded_for_date")
    .eq("user_id", user_id)
    .eq("recorded_for_date", dateISO);
  if (error) throw error;
  const acc: Record<"breakfast" | "lunch" | "dinner" | "snack", number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  };
  for (const row of data || []) {
    const mt = (row as any).meal_type as
      | "breakfast"
      | "lunch"
      | "dinner"
      | "snack"
      | null;
    if (!mt) continue; // skip rows without a meal_type
    const cals = Number((row as any).calories) || 0;
    acc[mt] += cals;
  }
  return acc;
}

// Timezone-safe variant for a specific ISO date (YYYY-MM-DD). Avoids JS Date parsing pitfalls.
export async function getMealCaloriesForDateISO(
  user_id: string,
  dateISO: string,
): Promise<Record<"breakfast" | "lunch" | "dinner" | "snack", number>> {
  const { data, error } = await supabase
    .from("food_logs")
    .select("meal_type, calories, recorded_for_date")
    .eq("user_id", user_id)
    .eq("recorded_for_date", dateISO);
  if (error) throw error;
  const acc: Record<"breakfast" | "lunch" | "dinner" | "snack", number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  };
  for (const row of data || []) {
    const mt = (row as any).meal_type as
      | "breakfast"
      | "lunch"
      | "dinner"
      | "snack"
      | null;
    if (!mt) continue;
    const cals = Number((row as any).calories) || 0;
    acc[mt] += cals;
  }
  return acc;
}

export async function getHistoryDates(user_id: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("food_logs")
    .select("recorded_for_date, created_at")
    .eq("user_id", user_id)
    .order("recorded_for_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const uniqueDates = new Set<string>();
  for (const row of data || []) {
    const rec = (row as any).recorded_for_date as string | null;
    if (rec) {
      uniqueDates.add(rec);
    } else {
      const fallback = toUTCDateISO((row as any).created_at);
      if (fallback) uniqueDates.add(fallback);
    }
  }

  return Array.from(uniqueDates).sort((a, b) => b.localeCompare(a));
}

export type HistoryLogItem = {
  id: string;
  created_at: string;
  recorded_for_date?: string | null;
  image_url?: string | null;
  title?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sodium_mg?: number;
  sugar_g?: number;
  fiber_g?: number;
  nutrition_edited?: boolean;
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | null;
  health_score?: number | null;
  health_recommendation?: string | null;
  title_en?: string | null;
  title_zh?: string | null;
  breakdown_en?: string | null;
  breakdown_zh?: string | null;
};

const HISTORY_LOG_SELECT_COLUMNS =
  "id, created_at, recorded_for_date, image_url, meal_type, title, calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g, food_json, title_en, title_zh, breakdown_en, breakdown_zh";

function normalizeHistoryLog(row: any): HistoryLogItem {
  if (!row) throw new Error("Cannot normalize null history row");
  const food = row.food_json || {};
  const title =
    (row.title && String(row.title)) ||
    (food.title && String(food.title)) ||
    (typeof food.food_breakdown === "string" && food.food_breakdown.length > 0
      ? String(food.food_breakdown).split(/[。\.]/)[0]
      : null);

  return {
    id: row.id,
    created_at: row.created_at,
    recorded_for_date: row.recorded_for_date ?? null,
    image_url: row.image_url ?? null,
    title,
    calories: Number(row.calories ?? food.calories ?? 0),
    protein_g: Number(row.protein_g ?? food.protein_g ?? 0),
    carbs_g: Number(row.carbs_g ?? food.carbs_g ?? 0),
    fat_g: Number(row.fat_g ?? food.fat_g ?? 0),
    sodium_mg: Number(row.sodium_mg ?? food.sodium_mg ?? 0),
    sugar_g: Number(row.sugar_g ?? food.sugar_g ?? 0),
    fiber_g: Number(row.fiber_g ?? food.fiber_g ?? 0),
    nutrition_edited: Boolean(food?.edit_tracking?.nutrition_edited),
    meal_type:
      (row.meal_type as "breakfast" | "lunch" | "dinner" | "snack" | null) ??
      null,
    title_en: row.title_en ?? null,
    title_zh: row.title_zh ?? null,
    breakdown_en: row.breakdown_en ?? null,
    breakdown_zh: row.breakdown_zh ?? null,
  };
}

export async function getLogsForDate(
  user_id: string,
  dateISO: string,
): Promise<HistoryLogItem[]> {
  // Build LOCAL day range [start, end)
  const { data, error } = await supabase
    .from("food_logs")
    .select(HISTORY_LOG_SELECT_COLUMNS)
    .eq("user_id", user_id)
    .eq("recorded_for_date", dateISO)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((row: any) => normalizeHistoryLog(row));
}

export async function getLogById(
  user_id: string,
  log_id: string,
): Promise<HistoryLogItem | null> {
  const { data, error } = await supabase
    .from("food_logs")
    .select(HISTORY_LOG_SELECT_COLUMNS)
    .eq("user_id", user_id)
    .eq("id", log_id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return normalizeHistoryLog(data);
}

export async function deleteFoodLog(
  user_id: string,
  log_id: string,
): Promise<void> {
  if (!user_id || !log_id) throw new Error("Missing user_id or log_id");
  const { error } = await supabase
    .from("food_logs")
    .delete()
    .eq("id", log_id)
    .eq("user_id", user_id);
  if (error) throw error;
}

export async function updateFoodLog(
  user_id: string,
  log_id: string,
  updates: Record<string, number>,
): Promise<void> {
  if (!user_id || !log_id) throw new Error("Missing user_id or log_id");
  const { error } = await supabase
    .from("food_logs")
    .update(updates)
    .eq("id", log_id)
    .eq("user_id", user_id);
  if (error) throw error;
}

export async function refreshFoodJson(
  user_id: string,
  log_id: string,
): Promise<Record<string, unknown> | null> {
  if (!user_id || !log_id) throw new Error("Missing user_id or log_id");
  const { data, error } = await supabase
    .from("food_logs")
    .select("food_json")
    .eq("user_id", user_id)
    .eq("id", log_id)
    .maybeSingle();
  if (error) throw error;
  return ((data as any)?.food_json as Record<string, unknown> | undefined) || null;
}



export async function analyzeLogWithAI(
  log_id: string,
): Promise<HistoryLogItem> {
  const actualLogId = log_id;
  if (!actualLogId) throw new Error("Log ID required");
  // Need session + uid first, then fetch row scoped to uid
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData?.session?.user?.id;
  const accessToken = sessionData?.session?.access_token as string | undefined;
  if (!uid || !accessToken) {
    if (__DEV__) console.warn("[analyzeLogWithAI] Not authenticated");
    throw new Error("Not authenticated");
  }

  const { data: row, error: fetchErr } = await supabase
    .from("food_logs")
    .select(
      "id, user_id, image_url, meal_type, recorded_for_date, title, food_json",
    )
    .eq("id", actualLogId)
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  if (fetchErr) {
    if (__DEV__) console.error("[analyzeLogWithAI] Fetch error", fetchErr);
    throw fetchErr;
  }
  if (!row) {
    if (__DEV__)
      console.warn("[analyzeLogWithAI] Log not found for current user", {
        log_id: actualLogId,
        uid,
      });
    throw new Error("Log not found");
  }

  const imageUri: string | null = (row as any).image_url ?? null;
  if (!imageUri) {
    if (__DEV__) console.warn("[analyzeLogWithAI] Missing image_url");
    throw new Error("Log has no image_url to analyze");
  }

  // Run analysis
  const analysis = await sendPhotoBase64ToOpenAI(imageUri, accessToken);
  const foodItems: FoodItem[] = Array.isArray(analysis?.foodItems)
    ? analysis.foodItems
    : [];
  const hasFoodItems = foodItems.length > 0;
  // Coerce each operand to Number: values from the LLM/edge function may
  // arrive as strings, which would otherwise cause `+` to concatenate.
  const calories = hasFoodItems
    ? foodItems.reduce((s, it) => s + Number(it.calories ?? 0), 0)
    : Number(analysis?.calories ?? 0);
  const carbs_g = hasFoodItems
    ? foodItems.reduce((s, it) => s + Number(it.macros?.carbs ?? 0), 0)
    : Number(analysis?.carbs_g ?? 0);
  const protein_g = hasFoodItems
    ? foodItems.reduce((s, it) => s + Number(it.macros?.protein ?? 0), 0)
    : Number(analysis?.protein_g ?? 0);
  const fat_g = hasFoodItems
    ? foodItems.reduce((s, it) => s + Number(it.macros?.fat ?? 0), 0)
    : Number(analysis?.fat_g ?? 0);
  const sodium_mg = hasFoodItems
    ? foodItems.reduce((s, it) => s + Number(it.macros?.sodium_mg ?? 0), 0)
    : Number(analysis?.sodium_mg ?? 0);
  const sugar_g = hasFoodItems
    ? foodItems.reduce((s, it) => s + Number(it.macros?.sugar_g ?? 0), 0)
    : Number(analysis?.sugar_g ?? 0);
  const fiber_g = hasFoodItems
    ? foodItems.reduce((s, it) => s + Number(it.macros?.fiber_g ?? 0), 0)
    : Number(analysis?.fiber_g ?? 0);

  const title =
    ((row as any).title && String((row as any).title)) ||
    (analysis?.title && String(analysis.title)) ||
    (hasFoodItems && foodItems[0]?.name) ||
    null;

  const mergedFoodJson = {
    ...(row as any).food_json,
    pending: false,
    food_breakdown: String(analysis?.food_breakdown || ""),
    tip_or_fact: String(analysis?.tip_or_fact || ""),
    suggestion: String(analysis?.suggestion || ""),
    title,
  };

  const { data: updated, error: updateErr } = await supabase
    .from("food_logs")
    .update({
      title,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      sodium_mg,
      sugar_g,
      fiber_g,
      food_json: mergedFoodJson,
      title_en: analysis?.title_en || null,
      title_zh: analysis?.title_zh || null,
      breakdown_en: analysis?.breakdown_en || null,
      breakdown_zh: analysis?.breakdown_zh || null,
    })
    .eq("id", actualLogId)
    .eq("user_id", uid)
    .select(HISTORY_LOG_SELECT_COLUMNS)
    .limit(1)
    .maybeSingle();
  if (updateErr) {
    if (__DEV__) console.error("[analyzeLogWithAI] Update error", updateErr);
    throw updateErr;
  }

  // RLS can allow UPDATE but not RETURNING. If no row returned, do a fallback fetch.
  let finalRow = updated as any;
  if (!finalRow) {
    if (__DEV__)
      console.warn(
        "[analyzeLogWithAI] No row returned after update; performing fallback SELECT",
      );
    const { data: fetched, error: fetchAfter } = await supabase
      .from("food_logs")
      .select(HISTORY_LOG_SELECT_COLUMNS)
      .eq("id", actualLogId)
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();
    if (fetchAfter) {
      if (__DEV__)
        console.error("[analyzeLogWithAI] Fallback SELECT error", fetchAfter);
      throw fetchAfter;
    }
    if (!fetched) {
      if (__DEV__)
        console.error(
          "[analyzeLogWithAI] Update succeeded but SELECT returned no row (RLS?)",
        );
      throw new Error("Update succeeded but row not visible by SELECT policy");
    }
    finalRow = fetched as any;
  }

  return normalizeHistoryLog(finalRow);
}
