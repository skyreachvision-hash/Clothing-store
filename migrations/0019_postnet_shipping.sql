-- Add PostNet as a carrier-neutral shipping method without changing existing providers.
-- PostNet credentials/rates will be configured separately before enabling it at checkout.
INSERT INTO shipping_methods (name, provider_type, mode, is_enabled, sort_order)
SELECT 'PostNet — Manual rates', 'postnet', 'manual', 0, 4
WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE provider_type = 'postnet');
