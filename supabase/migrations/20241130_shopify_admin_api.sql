-- Update Shopify connections table for Admin API
ALTER TABLE shopify_connections 
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS store_url TEXT;

-- Update orders table for Admin API fields
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_connection_id ON orders(connection_id);
CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_id ON orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_financial_status ON orders(financial_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);

-- Update RLS policies for new fields
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert own orders" ON orders;
CREATE POLICY "Users can insert own orders" ON orders FOR INSERT WITH CHECK (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own orders" ON orders;
CREATE POLICY "Users can update own orders" ON orders FOR UPDATE USING (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid()
  )
);

-- Create sync log table for tracking
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES shopify_connections(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- 'orders', 'products', etc.
  status VARCHAR(20) NOT NULL, -- 'success', 'error', 'in_progress'
  items_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS for sync_logs
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for sync_logs
CREATE POLICY "Users can view own sync logs" ON sync_logs FOR SELECT USING (
  connection_id IN (
    SELECT id FROM shopify_connections WHERE user_id = auth.uid()
  )
);

-- Index for sync_logs
CREATE INDEX IF NOT EXISTS idx_sync_logs_connection_id ON sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
