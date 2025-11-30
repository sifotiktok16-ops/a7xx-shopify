-- Update Shopify connections table for Admin API with enhanced user isolation
ALTER TABLE shopify_connections 
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS store_url TEXT,
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;

-- Update orders table for Admin API fields with strict user isolation
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES shopify_connections(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS shopify_order_id VARCHAR(50) UNIQUE,
ADD COLUMN IF NOT EXISTS order_number INTEGER,
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS subtotal_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS total_tax DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS currency VARCHAR(3),
ADD COLUMN IF NOT EXISTS financial_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS shipping_address TEXT,
ADD COLUMN IF NOT EXISTS billing_address TEXT,
ADD COLUMN IF NOT EXISTS line_items_data JSONB,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance with user isolation
CREATE INDEX IF NOT EXISTS idx_orders_connection_id ON orders(connection_id);
CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_id ON orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_financial_status ON orders(financial_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_shopify_connections_user_id ON shopify_connections(user_id);

-- Enhanced RLS policies for strict user isolation
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid() AND is_active = true
  )
);

DROP POLICY IF EXISTS "Users can insert own orders" ON orders;
CREATE POLICY "Users can insert own orders" ON orders FOR INSERT WITH CHECK (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid() AND is_active = true
  )
);

DROP POLICY IF EXISTS "Users can update own orders" ON orders;
CREATE POLICY "Users can update own orders" ON orders FOR UPDATE USING (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid() AND is_active = true
  )
);

DROP POLICY IF EXISTS "Users can delete own orders" ON orders;
CREATE POLICY "Users can delete own orders" ON orders FOR DELETE USING (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Enhanced RLS policies for shopify_connections
DROP POLICY IF EXISTS "Users can view own connections" ON shopify_connections;
CREATE POLICY "Users can view own connections" ON shopify_connections FOR SELECT USING (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can insert own connections" ON shopify_connections;
CREATE POLICY "Users can insert own connections" ON shopify_connections FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can update own connections" ON shopify_connections;
CREATE POLICY "Users can update own connections" ON shopify_connections FOR UPDATE USING (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can delete own connections" ON shopify_connections;
CREATE POLICY "Users can delete own connections" ON shopify_connections FOR DELETE USING (
  user_id = auth.uid()
);

-- Create sync log table for tracking with user isolation
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES shopify_connections(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- 'orders', 'products', etc.
  status VARCHAR(20) NOT NULL, -- 'success', 'error', 'in_progress'
  items_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id) -- Track which user initiated the sync
);

-- Enable RLS for sync_logs
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for sync_logs with user isolation
CREATE POLICY "Users can view own sync logs" ON sync_logs FOR SELECT USING (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid() AND is_active = true
  )
);

CREATE POLICY "Users can insert own sync logs" ON sync_logs FOR INSERT WITH CHECK (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Index for sync_logs with user isolation
CREATE INDEX IF NOT EXISTS idx_sync_logs_connection_id ON sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_by ON sync_logs(created_by);

-- Function to ensure user data isolation
CREATE OR REPLACE FUNCTION ensure_user_data_isolation()
RETURNS TRIGGER AS $$
BEGIN
  -- Verify that the connection_id belongs to the current user
  IF NOT EXISTS (
    SELECT 1 FROM shopify_connections 
    WHERE id = NEW.connection_id 
    AND user_id = auth.uid() 
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Connection does not belong to current user';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to enforce user data isolation
DROP TRIGGER IF EXISTS enforce_orders_user_isolation ON orders;
CREATE TRIGGER enforce_orders_user_isolation
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION ensure_user_data_isolation();

-- Function to clean up user data when connection is deactivated
CREATE OR REPLACE FUNCTION cleanup_user_data()
RETURNS TRIGGER AS $$
BEGIN
  -- If connection is being deactivated, clean up associated data
  IF OLD.is_active = true AND NEW.is_active = false THEN
    -- Delete all orders for this connection
    DELETE FROM orders WHERE connection_id = NEW.id;
    
    -- Delete all sync logs for this connection
    DELETE FROM sync_logs WHERE connection_id = NEW.id;
    
    -- Log the cleanup
    INSERT INTO sync_logs (connection_id, sync_type, status, items_processed, error_message, started_at, completed_at, created_by)
    VALUES (NEW.id, 'cleanup', 'success', 0, 'User connection deactivated - data cleaned up', NOW(), NOW(), NEW.user_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for cleanup
DROP TRIGGER IF EXISTS cleanup_user_data_trigger ON shopify_connections;
CREATE TRIGGER cleanup_user_data_trigger
  AFTER UPDATE ON shopify_connections
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_user_data();

-- Add comment for documentation
COMMENT ON TABLE shopify_connections IS 'User Shopify connections with strict data isolation';
COMMENT ON TABLE orders IS 'Shopify orders isolated by user connection';
COMMENT ON TABLE sync_logs IS 'Sync logs with user tracking and isolation';
