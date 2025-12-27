-- Rename API credential columns to encrypted_* if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shopify_connections' AND column_name = 'api_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shopify_connections' AND column_name = 'encrypted_api_key'
  ) THEN
    ALTER TABLE shopify_connections RENAME COLUMN api_key TO encrypted_api_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shopify_connections' AND column_name = 'api_secret'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shopify_connections' AND column_name = 'encrypted_api_secret'
  ) THEN
    ALTER TABLE shopify_connections RENAME COLUMN api_secret TO encrypted_api_secret;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shopify_connections' AND column_name = 'access_token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shopify_connections' AND column_name = 'encrypted_access_token'
  ) THEN
    ALTER TABLE shopify_connections RENAME COLUMN access_token TO encrypted_access_token;
  END IF;
END $$;
