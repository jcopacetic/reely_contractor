import { apiQuery } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Downloadable JSON export of everything the contractor owns here (profile + inbound leads + prefs). */
export async function GET() {
  const data = await apiQuery<Record<string, unknown>>('profile.exportData', {}).catch(() => ({} as Record<string, unknown>))
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="reely-contractor-data.json"',
      'cache-control': 'no-store',
    },
  })
}
