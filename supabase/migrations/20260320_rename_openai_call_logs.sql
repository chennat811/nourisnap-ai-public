-- Rename openai_call_logs to ai_call_logs
ALTER TABLE IF EXISTS "public"."openai_call_logs" RENAME TO "ai_call_logs";

-- Rename indexes to match new table name
ALTER INDEX IF EXISTS "openai_call_logs_pkey" RENAME TO "ai_call_logs_pkey";
ALTER INDEX IF EXISTS "openai_call_logs_correlation_id_idx" RENAME TO "ai_call_logs_correlation_id_idx";
ALTER INDEX IF EXISTS "openai_call_logs_created_at_idx" RENAME TO "ai_call_logs_created_at_idx";
ALTER INDEX IF EXISTS "openai_call_logs_user_id_idx" RENAME TO "ai_call_logs_user_id_idx";
ALTER INDEX IF EXISTS "idx_openai_call_logs_image_url" RENAME TO "idx_ai_call_logs_image_url";
