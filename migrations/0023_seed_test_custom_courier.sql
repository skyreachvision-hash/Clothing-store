-- Seed removable test data for the Custom Courier admin/checkout flow.
-- This is database configuration, not application hardcoding. It can be deleted
-- normally from Admin -> Shipping -> Custom Couriers after testing.

INSERT INTO shipping_methods
  (name, provider_type, mode, is_enabled, sort_order)
VALUES
  ('Test Fashion Courier', 'custom', 'manual', 1, 9000);

INSERT INTO custom_couriers
  (shipping_method_id, description, calculation_mode)
VALUES
  (last_insert_rowid(), 'Temporary test courier for weight, parcel type and dimension-based pricing.', 'weight');

INSERT INTO custom_courier_rates
  (custom_courier_id, service_name, area_name, packaging_type,
   min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm,
   price, estimated_delivery, is_enabled, sort_order)
VALUES
  (last_insert_rowid(), 'Economy', '', 'bag',
   0, 5, NULL, NULL, NULL,
   60, '3–7 business days', 1, 0);

INSERT INTO custom_courier_rates
  (custom_courier_id, service_name, area_name, packaging_type,
   min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm,
   price, estimated_delivery, is_enabled, sort_order)
VALUES
  (last_insert_rowid(), 'Standard', '', 'bag',
   5.001, 10, NULL, NULL, NULL,
   80, '3–7 business days', 1, 1);

INSERT INTO custom_courier_rates
  (custom_courier_id, service_name, area_name, packaging_type,
   min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm,
   price, estimated_delivery, is_enabled, sort_order)
VALUES
  (last_insert_rowid(), 'Box Economy', '', 'box',
   0, 5, 40, 30, 20,
   75, '3–7 business days', 1, 2);
