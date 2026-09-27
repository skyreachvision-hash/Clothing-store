-- Optional product shipping metadata. Safe for existing products.
-- This does not make product loading dependent on shipping configuration.
ALTER TABLE products ADD COLUMN shipping_type_id INTEGER;
ALTER TABLE products ADD COLUMN shipping_packaging_mode TEXT
  CHECK (shipping_packaging_mode IN ('compressible','prepacked'));
ALTER TABLE products ADD COLUMN shipping_weight_kg REAL
  CHECK (shipping_weight_kg IS NULL OR shipping_weight_kg >= 0);
ALTER TABLE products ADD COLUMN shipping_length_cm REAL
  CHECK (shipping_length_cm IS NULL OR shipping_length_cm >= 0);
ALTER TABLE products ADD COLUMN shipping_width_cm REAL
  CHECK (shipping_width_cm IS NULL OR shipping_width_cm >= 0);
ALTER TABLE products ADD COLUMN shipping_height_cm REAL
  CHECK (shipping_height_cm IS NULL OR shipping_height_cm >= 0);

CREATE INDEX IF NOT EXISTS idx_products_shipping_type
  ON products (shipping_type_id);
