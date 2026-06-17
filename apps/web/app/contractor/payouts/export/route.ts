import { apiQuery } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Download the contractor's transaction ledger as CSV or JSON (?format=csv|json). Authed via the contractor
 *  middleware + apiQuery's acting-user headers; the CSV is formatted server-side in the api. */
export async function GET(req: Request): Promise<Response> {
  const json = new URL(req.url).searchParams.get('format') === 'json'
  if (json) {
    const rows = await apiQuery<unknown[]>('payments.ledger').catch(() => [])
    return new Response(JSON.stringify(rows ?? [], null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="reely-transactions.json"' },
    })
  }
  const csv = await apiQuery<string>('payments.ledgerCsv').catch(() => '')
  return new Response(csv ?? '', {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="reely-transactions.csv"' },
  })
}
