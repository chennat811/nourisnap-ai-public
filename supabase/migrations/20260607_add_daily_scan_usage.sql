-- Server-side daily scan usage tracking.
-- Enforces per-user daily scan limits so they cannot be bypassed client-side.

CREATE TABLE IF NOT EXISTS "public"."daily_scan_usage" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "user_id" "uuid" NOT NULL,
  "scan_date" "date" NOT NULL DEFAULT CURRENT_DATE,
  "scan_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "daily_scan_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_scan_usage_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  CONSTRAINT "daily_scan_usage_user_date_unique" UNIQUE ("user_id", "scan_date")
);

ALTER TABLE "public"."daily_scan_usage" OWNER TO "postgres";

ALTER TABLE "public"."daily_scan_usage" ENABLE ROW LEVEL SECURITY;

-- Users may read their own usage. Writes happen only via the Edge Function
-- using the service-role client, which bypasses RLS.
CREATE POLICY "daily_scan_usage_select_own"
  ON "public"."daily_scan_usage"
  FOR SELECT
  USING (("auth"."uid"() = "user_id"));

COMMENT ON TABLE "public"."daily_scan_usage" IS
  'Tracks per-user daily scan counts for server-side quota enforcement.';
