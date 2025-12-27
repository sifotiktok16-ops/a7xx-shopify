-- Auth/User isolation and Shopify connection hardening
-- 1) Ensure per-user single connection and required columns exist
ALTER TABLE shopify_connections 
  ADD COLUMN IF NOT EXISTS api_key TEXT,
  ADD COLUMN IF NOT EXISTS api_secret TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;

-- 2) One row per user (enables upsert on user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_shopify_connections_user_id'
  ) THEN
    CREATE UNIQUE INDEX uniq_shopify_connections_user_id ON shopify_connections(user_id);
  END IF;
END $$;

-- 3) Touch updated_at automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_shopify_connections ON shopify_connections;
CREATE TRIGGER set_timestamp_shopify_connections
BEFORE UPDATE ON shopify_connections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
