-- Optional product shipping metadata. Kept separate from the core products table so catalogue loading remains independent.
CREATE TABLE IF NOT EXISTS product_shipping (
  product_id INTEGER PRIMARY KEY,
  shipping_type_id INTEGER NOT NULL,
  packing_mode TEXT NOT NULL DEFAULT 'compressible'
    CHECK (packing_mode IN ('compressible','prepackaged')),
  weight_kg REAL NOT NULL CHECK (weight_kg >= 0),
  length_cm REAL,
  width_cm REAL,
  height_cm REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (shipping_type_id) REFERENCES shipping_types(id)
);

CREATE INDEX IF NOT EXISTS idx_product_shipping_type
  ON product_shipping (shipping_type_id);
