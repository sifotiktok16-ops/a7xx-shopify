-- Expand orders and products schema to store richer Shopify data
-- Orders: add canonical order_id, financial_status, customer (jsonb), line_items (jsonb), updated_at
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS financial_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS customer JSONB,
  ADD COLUMN IF NOT EXISTS line_items JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Products: add canonical product_id, images (jsonb), variants (jsonb), updated_at
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS images JSONB,
  ADD COLUMN IF NOT EXISTS variants JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Updated-at trigger for orders
CREATE OR REPLACE FUNCTION set_updated_at_generic()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_orders ON orders;
CREATE TRIGGER set_timestamp_orders
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();

-- Updated-at trigger for products
DROP TRIGGER IF EXISTS set_timestamp_products ON products;
CREATE TRIGGER set_timestamp_products
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();

-- Unique indexes on canonical IDs (preserve legacy unique on shopify_* if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_orders_connection_order_id'
  ) THEN
    CREATE UNIQUE INDEX uniq_orders_connection_order_id ON orders(connection_id, order_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_products_connection_product_id'
  ) THEN
    CREATE UNIQUE INDEX uniq_products_connection_product_id ON products(connection_id, product_id);
  END IF;
END $$;

-- Backfill canonical IDs from legacy columns where null
UPDATE orders SET order_id = shopify_order_id WHERE order_id IS NULL;
UPDATE products SET product_id = shopify_product_id WHERE product_id IS NULL;
