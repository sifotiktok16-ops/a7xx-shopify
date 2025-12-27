import { supabase } from '@/lib/supabase'

export class AutoSyncService {
  private static readonly SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes
  private static syncTimer: NodeJS.Timeout | null = null

  // Start automatic sync for all active connections
  static startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
    }

    // Initial sync
    this.syncAllConnections()

    // Set up recurring sync
    this.syncTimer = setInterval(() => {
      this.syncAllConnections()
    }, this.SYNC_INTERVAL)

    console.log('Auto-sync started: syncing every 5 minutes')
  }

  // Stop automatic sync
  static stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
      console.log('Auto-sync stopped')
    }
  }

  // Sync all active Shopify connections
  private static async syncAllConnections(): Promise<void> {
    try {
      // Get all active connections
      const { data: connections, error } = await supabase
        .from('shopify_connections')
        .select('id, user_id, store_url')
        .eq('is_active', true)

      if (error) {
        console.error('Error fetching connections:', error)
        return
      }

      if (!connections || connections.length === 0) {
        console.log('No active connections to sync')
        return
      }

      // Sync each connection
      for (const connection of connections) {
        try {
          await this.syncConnection(connection.id, connection.user_id)
        } catch (error) {
          console.error(`Failed to sync connection ${connection.id}:`, error)
        }
      }

    } catch (error) {
      console.error('Auto-sync error:', error)
    }
  }

  // Sync a specific connection
  private static async syncConnection(connectionId: string, userId: string): Promise<void> {
    try {
      // --- 1. SYNC ORDERS (Chained/Recursive) ---
      let ordersLogId: string | null = null

      try {
        // Initial request
        let nextCursor: string | null = null
        let hasMore = true
        let totalItems = 0

        console.log(`Starting orders sync for ${connectionId}...`)

        while (hasMore) {
          const payload: any = {
            user_id: userId,
            sync_log_id: ordersLogId, // Pass ID to keep using same log
            cursor: nextCursor
          }

          const resp = await fetch('/api/shopify/sync-orders?mode=auto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (!resp.ok) {
            const errText = await resp.text()
            throw new Error(`Sync API failed (${resp.status}): ${errText}`)
          }

          const data = await resp.json()

          if (!data.success) {
            throw new Error(data.error || 'Unknown sync error')
          }

          // Capture the log ID from the first response if we didn't have it
          if (!ordersLogId && data.sync_log_id) {
            ordersLogId = data.sync_log_id
          }

          // Update local state
          nextCursor = data.next_cursor
          hasMore = !!nextCursor
          totalItems += (data.processed || 0)

          console.log(`Processed batch: ${data.processed} orders. More: ${hasMore}`)
        }

        console.log(`Sync complete. Total orders: ${totalItems}`)

      } catch (err: any) {
        console.error(`Orders sync failed for ${connectionId}:`, err)
        // If we have a log ID, mark it as error in DB since backend might not have caught a network crash
        if (ordersLogId) {
          await supabase.from('sync_logs').update({
            status: 'error',
            error_message: err.message,
            completed_at: new Date().toISOString()
          }).eq('id', ordersLogId)
        }
      }

      // Create a separate log for products sync
      const { data: prodLog } = await supabase
        .from('sync_logs')
        .insert({
          connection_id: connectionId,
          sync_type: 'products',
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      // Trigger backend sync (products)
      const productsResp = await fetch('/api/shopify/sync-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const productsJson = await productsResp.json().catch(() => ({ success: false, error: 'Invalid server response' }))

      if (productsResp.ok && productsJson?.success) {
        await supabase
          .from('sync_logs')
          .update({
            status: 'success',
            items_processed: productsJson.items_processed || 0,
            completed_at: new Date().toISOString(),
          })
          .eq('id', prodLog.id)
        console.log(`Synced ${productsJson.items_processed || 0} products for connection ${connectionId}`)
      } else {
        await supabase
          .from('sync_logs')
          .update({
            status: 'error',
            error_message: productsJson?.error || `HTTP ${productsResp.status}`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', prodLog.id)
        console.error(`Products sync failed for connection ${connectionId}:`, productsJson?.error)
      }

    } catch (error) {
      console.error(`Sync error for connection ${connectionId}:`, error)
    }
  }

  // Manual sync trigger
  static async triggerManualSync(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get user's active connection
      const { data: connection, error } = await supabase
        .from('shopify_connections')
        .select('id, store_url')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (error || !connection) {
        return { success: false, message: 'No active Shopify connection found' }
      }

      // Trigger sync via backend
      await this.syncConnection(connection.id, userId)

      return { success: true, message: 'Manual sync completed successfully' }

    } catch (error) {
      console.error('Manual sync error:', error)
      return { success: false, message: 'Manual sync failed' }
    }
  }

  // Get sync status for a user
  static async getSyncStatus(userId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('sync_logs')
        .select(`
          *,
          shopify_connections!inner(
            store_url,
            user_id
          )
        `)
        .eq('shopify_connections.user_id', userId)
        .order('started_at', { ascending: false })
        .limit(10)

      if (error) throw error

      return data || []

    } catch (error) {
      console.error('Error fetching sync status:', error)
      return []
    }
  }
}
