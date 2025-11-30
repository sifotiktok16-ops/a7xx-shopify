-- Fix schema for e-commerce dashboard
-- Drop existing tables if they exist
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS shopify_connections;

-- Shopify Connections Table
CREATE TABLE shopify_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_url VARCHAR(255) NOT NULL,
  access_token VARCHAR(500) NOT NULL,
  store_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE shopify_connections ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own connections" ON shopify_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own connections" ON shopify_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own connections" ON shopify_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own connections" ON shopify_connections FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON shopify_connections TO authenticated;

-- Orders Table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES shopify_connections(id) ON DELETE CASCADE,
  shopify_order_id VARCHAR(100) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  customer_email VARCHAR(255),
  fulfillment_status VARCHAR(50),
  order_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(connection_id, shopify_order_id)
);

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM shopify_connections 
    WHERE shopify_connections.id = orders.connection_id 
    AND shopify_connections.user_id = auth.uid()
  )
);

-- Grant permissions
GRANT SELECT ON orders TO authenticated;

-- Create indexes
CREATE INDEX idx_orders_connection_id ON orders(connection_id);
CREATE INDEX idx_orders_order_date ON orders(order_date DESC);

-- Products Table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES shopify_connections(id) ON DELETE CASCADE,
  shopify_product_id VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  price DECIMAL(10,2),
  inventory_quantity INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(connection_id, shopify_product_id)
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own products" ON products FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM shopify_connections 
    WHERE shopify_connections.id = products.connection_id 
    AND shopify_connections.user_id = auth.uid()
  )
);

-- Grant permissions
GRANT SELECT ON products TO authenticated;

-- Create indexes
CREATE INDEX idx_products_connection_id ON products(connection_id);

-- API Keys Table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage own API keys" ON api_keys FOR ALL USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON api_keys TO authenticated;