-- Delivery Connections Table
CREATE TABLE delivery_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name VARCHAR(50) NOT NULL, -- fedex, ups, dhl, etc.
  api_key VARCHAR(500) NOT NULL,
  api_secret VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE delivery_connections ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own delivery connections" ON delivery_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own delivery connections" ON delivery_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own delivery connections" ON delivery_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own delivery connections" ON delivery_connections FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON delivery_connections TO authenticated;

-- Create indexes
CREATE INDEX idx_delivery_connections_user_id ON delivery_connections(user_id);
CREATE INDEX idx_delivery_connections_service ON delivery_connections(service_name);

-- Add financial_status column to orders table if it doesn't exist
ALTER TABLE orders ADD COLUMN IF NOT EXISTS financial_status VARCHAR(50);

-- Update orders table to include more Shopify fields
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS line_items_data JSONB,
  ADD COLUMN IF NOT EXISTS shopify_created_at TIMESTAMP WITH TIME ZONE;

-- Create index for order status queries
CREATE INDEX IF NOT EXISTS idx_orders_financial_status ON orders(financial_status);
