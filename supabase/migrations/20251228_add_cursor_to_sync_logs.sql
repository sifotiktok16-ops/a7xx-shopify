-- Add cursor_state to sync_logs to support resumable syncs
ALTER TABLE sync_logs
ADD COLUMN IF NOT EXISTS cursor_state TEXT;