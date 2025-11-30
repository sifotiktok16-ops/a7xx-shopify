import { ShopifyAdminService } from './shopifyAdmin'
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
      // Log sync start
      const { data: log } = await supabase
        .from('sync_logs')
        .insert({
          connection_id: connectionId,
          sync_type: 'orders',
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      // Fetch orders from Shopify
      const result = await ShopifyAdminService.fetchAllOrders(userId)

      if (result.success) {
        // Update sync log with success
        await supabase
          .from('sync_logs')
          .update({
            status: 'success',
            items_processed: result.orders?.length || 0,
            completed_at: new Date().toISOString(),
          })
          .eq('id', log.id)

        console.log(`Synced ${result.orders?.length || 0} orders for connection ${connectionId}`)
      } else {
        // Update sync log with error
        await supabase
          .from('sync_logs')
          .update({
            status: 'error',
            error_message: result.error,
            completed_at: new Date().toISOString(),
          })
          .eq('id', log.id)

        console.error(`Sync failed for connection ${connectionId}:`, result.error)
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

      // Trigger sync
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
