-- 003: link MealLine cases to their FoodFit fulfillment visit.
ALTER TABLE assistance_cases
  ADD COLUMN IF NOT EXISTS foodfit_visit_id TEXT,
  ADD COLUMN IF NOT EXISTS foodfit_visit_code TEXT,
  ADD COLUMN IF NOT EXISTS foodfit_basket JSONB;
