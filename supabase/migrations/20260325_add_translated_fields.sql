-- Add language-specific fields to food_logs table for bidirectional translation
ALTER TABLE public.food_logs
ADD COLUMN IF NOT EXISTS title_en text,
ADD COLUMN IF NOT EXISTS title_zh text,
ADD COLUMN IF NOT EXISTS breakdown_en text,
ADD COLUMN IF NOT EXISTS breakdown_zh text;

COMMENT ON COLUMN public.food_logs.title_en IS 'English version of the dish title';
COMMENT ON COLUMN public.food_logs.title_zh IS 'Traditional Chinese version of the dish title';
COMMENT ON COLUMN public.food_logs.breakdown_en IS 'English version of the food breakdown text';
COMMENT ON COLUMN public.food_logs.breakdown_zh IS 'Traditional Chinese version of the food breakdown text';
