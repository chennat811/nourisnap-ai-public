-- Migration: Add data_collection_consent column to user_settings
-- This enables explicit opt-in for training data collection (GDPR/App Store compliance)

ALTER TABLE "public"."user_settings" 
ADD COLUMN IF NOT EXISTS "data_collection_consent" BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN "public"."user_settings"."data_collection_consent" 
IS 'User consent to store meal photos for AI training dataset improvement';
