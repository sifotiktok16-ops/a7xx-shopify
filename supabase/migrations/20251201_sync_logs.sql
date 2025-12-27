-- Sync logs table for per-user connection sync tracking
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES shopify_connections(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- e.g. 'orders:auto' | 'orders:manual' | 'products:auto'
  status TEXT NOT NULL CHECK (status IN ('in_progress','success','error','overridden')),
  items_processed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sync_logs_connection_id ON sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type ON sync_logs(sync_type);

-- RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Only allow selecting logs for connections the user owns
CREATE POLICY IF NOT EXISTS "Users can view own sync logs" ON sync_logs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM shopify_connections c
    WHERE c.id = sync_logs.connection_id AND c.user_id = auth.uid()
  )
);

-- Allow insert/update/delete for owner when not using service role (optional)
CREATE POLICY IF NOT EXISTS "Users can modify own sync logs" ON sync_logs
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM shopify_connections c
    WHERE c.id = sync_logs.connection_id AND c.user_id = auth.uid()
  )
);
