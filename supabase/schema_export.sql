


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."activity_level_type" AS ENUM (
    'sedentary',
    'light',
    'moderate',
    'active',
    'very_active'
);


ALTER TYPE "public"."activity_level_type" OWNER TO "postgres";


CREATE TYPE "public"."goal_type" AS ENUM (
    'maintain',
    'lose',
    'gain'
);


ALTER TYPE "public"."goal_type" OWNER TO "postgres";


CREATE TYPE "public"."meal_type" AS ENUM (
    'breakfast',
    'lunch',
    'dinner',
    'snack'
);


ALTER TYPE "public"."meal_type" OWNER TO "postgres";


CREATE TYPE "public"."sex_type" AS ENUM (
    'male',
    'female'
);


ALTER TYPE "public"."sex_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."food_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "recorded_for_date" "date",
    "image_url" "text",
    "meal_type" "text",
    "title" "text",
    "calories" numeric NOT NULL,
    "protein_g" numeric NOT NULL,
    "carbs_g" numeric NOT NULL,
    "fat_g" numeric NOT NULL,
    "food_json" "jsonb",
    "idempotency_key" "text",
    "food_breakdown" "text",
    "sodium_mg" numeric DEFAULT 0,
    "sugar_g" numeric DEFAULT 0,
    "fiber_g" numeric DEFAULT 0,
    "health_score" numeric(3,1),
    "health_recommendation" "text",
    CONSTRAINT "food_logs_meal_type_check" CHECK (("meal_type" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text"])))
);


ALTER TABLE "public"."food_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."food_logs"."health_score" IS 'Health score from 1-10 based on nutrient density, fiber, sugar, sodium, and processing type';



COMMENT ON COLUMN "public"."food_logs"."health_recommendation" IS 'Single sentence health recommendation or praise based on the score';



CREATE TABLE IF NOT EXISTS "public"."general_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "feedback_type" "text" NOT NULL,
    "feedback_text" "text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "general_feedback_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['bug'::"text", 'feature_request'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."general_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."openai_call_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "correlation_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "analysis_mode" "text",
    "ok" boolean DEFAULT true NOT NULL,
    "status_code" integer,
    "error" "text",
    "openai_request_id" "text",
    "completion_id" "text",
    "model" "text",
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "usage" "jsonb",
    "request_payload" "jsonb",
    "response_json" "jsonb",
    "latency_ms" integer,
    "prompt_input" "jsonb",
    "image_url" "text",
    "image_size_bytes" integer
);


ALTER TABLE "public"."openai_call_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "age" integer,
    "sex" "text",
    "weight_kg" numeric(6,2),
    "height_cm" numeric(6,2),
    "activity_level" "text",
    "goal" "text",
    "calorie_target" numeric,
    "protein_target_g" numeric,
    "carb_target_g" numeric,
    "fat_target_g" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sodium_target_mg" numeric DEFAULT 2300,
    "sugar_target_g" numeric DEFAULT 50,
    "fiber_target_g" numeric DEFAULT 30,
    CONSTRAINT "user_settings_activity_level_check" CHECK (("activity_level" = ANY (ARRAY['sedentary'::"text", 'light'::"text", 'moderate'::"text", 'active'::"text", 'very_active'::"text"]))),
    CONSTRAINT "user_settings_goal_check" CHECK (("goal" = ANY (ARRAY['maintain'::"text", 'lose'::"text", 'gain'::"text"]))),
    CONSTRAINT "user_settings_sex_check" CHECK (("sex" = ANY (ARRAY['male'::"text", 'female'::"text"])))
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."food_logs"
    ADD CONSTRAINT "food_logs_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."food_logs"
    ADD CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."general_feedback"
    ADD CONSTRAINT "general_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."openai_call_logs"
    ADD CONSTRAINT "openai_call_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_food_logs_health_score" ON "public"."food_logs" USING "btree" ("health_score");



CREATE INDEX "idx_food_logs_meal_type" ON "public"."food_logs" USING "btree" ("meal_type");



CREATE INDEX "idx_food_logs_recorded_date" ON "public"."food_logs" USING "btree" ("recorded_for_date");



CREATE INDEX "idx_food_logs_user_date" ON "public"."food_logs" USING "btree" ("user_id", "recorded_for_date");



CREATE INDEX "idx_food_logs_user_id" ON "public"."food_logs" USING "btree" ("user_id");



CREATE INDEX "idx_general_feedback_submitted_at" ON "public"."general_feedback" USING "btree" ("submitted_at" DESC);



CREATE INDEX "idx_general_feedback_user_id" ON "public"."general_feedback" USING "btree" ("user_id");



CREATE INDEX "idx_openai_call_logs_image_url" ON "public"."openai_call_logs" USING "btree" ("image_url") WHERE ("image_url" IS NOT NULL);



CREATE INDEX "idx_user_settings_user_id" ON "public"."user_settings" USING "btree" ("user_id");



CREATE INDEX "openai_call_logs_correlation_id_idx" ON "public"."openai_call_logs" USING "btree" ("correlation_id");



CREATE INDEX "openai_call_logs_created_at_idx" ON "public"."openai_call_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "openai_call_logs_user_id_idx" ON "public"."openai_call_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "trg_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."food_logs"
    ADD CONSTRAINT "food_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."general_feedback"
    ADD CONSTRAINT "general_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can insert their own feedback" ON "public"."general_feedback" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own feedback" ON "public"."general_feedback" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."food_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "food_logs_delete_own" ON "public"."food_logs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "food_logs_insert_own" ON "public"."food_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "food_logs_select_own" ON "public"."food_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "food_logs_update_own" ON "public"."food_logs" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."general_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."openai_call_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_settings_select_own" ON "public"."user_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_settings_update_own" ON "public"."user_settings" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_settings_upsert_own" ON "public"."user_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."food_logs" TO "anon";
GRANT ALL ON TABLE "public"."food_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."food_logs" TO "service_role";



GRANT ALL ON TABLE "public"."general_feedback" TO "anon";
GRANT ALL ON TABLE "public"."general_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."general_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."openai_call_logs" TO "anon";
GRANT ALL ON TABLE "public"."openai_call_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."openai_call_logs" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







RESET ALL;
