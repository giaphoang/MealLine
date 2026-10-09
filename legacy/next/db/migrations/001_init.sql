-- Nourish: unified food access infrastructure
-- Combines FEED's inventory model with MealLine voice intake + FoodFit matching

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Food inventory (from FEED's FoodItem model)
CREATE TABLE IF NOT EXISTS food_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_search TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'unit',
  is_in_stock BOOLEAN NOT NULL DEFAULT true,
  -- Dietary flags (from FEED)
  vegan BOOLEAN NOT NULL DEFAULT false,
  vegetarian BOOLEAN NOT NULL DEFAULT false,
  gluten_free BOOLEAN NOT NULL DEFAULT false,
  halal BOOLEAN NOT NULL DEFAULT false,
  kosher BOOLEAN NOT NULL DEFAULT false,
  -- Storage requirements (for equipment matching)
  requires_stove BOOLEAN NOT NULL DEFAULT false,
  requires_fridge BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_food_items_category ON food_items(category);
CREATE INDEX IF NOT EXISTS idx_food_items_in_stock ON food_items(is_in_stock);

-- Voice intakes (from MealLine)
CREATE TABLE IF NOT EXISTS voice_intakes (
  id TEXT PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'vi', 'es')),
  phone TEXT,
  address_raw TEXT,
  address_street TEXT,
  address_city TEXT,
  address_zip TEXT,
  household_size INTEGER,
  dietary_avoid TEXT[] DEFAULT '{}',
  dietary_notes TEXT,
  has_stove BOOLEAN,
  has_fridge BOOLEAN,
  availability_raw TEXT,
  availability_days TEXT[] DEFAULT '{}',
  availability_times TEXT[] DEFAULT '{}',
  contact_preference TEXT CHECK (contact_preference IN ('callback', 'status_link')),
  accommodation TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'assigned', 'delivered', 'cancelled')),
  transcript JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_intakes_status ON voice_intakes(status);
CREATE INDEX IF NOT EXISTS idx_voice_intakes_case_number ON voice_intakes(case_number);

-- Shopping lists / baskets (from FEED + FoodFit)
CREATE TABLE IF NOT EXISTS shopping_lists (
  id SERIAL PRIMARY KEY,
  intake_id TEXT REFERENCES voice_intakes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'packed', 'delivered')),
  items JSONB NOT NULL DEFAULT '[]',
  -- items: [{foodItemId, name, quantity, unit, notes}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_intake ON shopping_lists(intake_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_status ON shopping_lists(status);

-- Staff users (simple, no JWT complexity)
CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'coordinator', 'volunteer')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deliveries / task assignments
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  shopping_list_id INTEGER REFERENCES shopping_lists(id) ON DELETE CASCADE,
  intake_id TEXT REFERENCES voice_intakes(id) ON DELETE SET NULL,
  assigned_to TEXT REFERENCES staff_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_transit', 'delivered', 'failed')),
  scheduled_for TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_assigned ON deliveries(assigned_to);
