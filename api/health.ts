import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
    runtime: 'nodejs20.x',
    maxDuration: 10,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const checks = {
            encryption_key: !!process.env.ENCRYPTION_KEY,
            supabase_url: !!process.env.VITE_SUPABASE_URL,
            supabase_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            shopify_api_version: process.env.SHOPIFY_API_VERSION || '2024-01',
            vercel_region: process.env.VERCEL_REGION || 'unknown',
            node_version: process.version,
        }

        const allGood = checks.encryption_key && checks.supabase_url && checks.supabase_service_key

        return res.status(allGood ? 200 : 500).json({
            status: allGood ? 'healthy' : 'unhealthy',
            checks,
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        })
    }
}
