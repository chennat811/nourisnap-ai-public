-- Add health score columns to food_logs table
-- health_score: 1-10 scale based on nutrient density and processing type
-- health_recommendation: Single sentence praise or improvement suggestion

ALTER TABLE food_logs
ADD COLUMN IF NOT EXISTS health_score DECIMAL(3,1),
ADD COLUMN IF NOT EXISTS health_recommendation TEXT;

-- Add index for querying by health score
CREATE INDEX IF NOT EXISTS idx_food_logs_health_score ON food_logs(health_score);

COMMENT ON COLUMN food_logs.health_score IS 'Health score from 1-10 based on nutrient density, fiber, sugar, sodium, and processing type';
COMMENT ON COLUMN food_logs.health_recommendation IS 'Single sentence health recommendation or praise based on the score';
