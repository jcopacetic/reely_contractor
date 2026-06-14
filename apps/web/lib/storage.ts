import 'server-only'

/**
 * Supabase Storage uploader for contractor profile media (avatar + landing-page image blocks). Hand-rolled
 * REST (no SDK dep), service-key upload to a PUBLIC bucket in contractor's own Supabase project. Runs ONLY in
 * server actions — the service key never reaches the browser. Returns null when storage is unconfigured
 * (local/dev) so callers degrade to a friendly message. R2 stays dormant (owner couldn't set up Cloudflare).
 *
 * Prod note: SUPABASE_URL + SUPABASE_SERVICE_KEY must be set on the WEB deployment (Vercel), not just the api,
 * because the upload runs here in a Next server action.
 */
const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_KEY
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET ?? 'media'

export const storageConfigured = (): boolean => Boolean(URL_BASE && KEY)

/** Sniff the leading magic bytes to confirm the payload is actually a WebP/JPEG/PNG/GIF — don't trust the
 *  client-declared MIME (a crafted request could label arbitrary bytes as image/webp). */
export function looksLikeImage(b: Uint8Array): boolean {
  if (b.length < 12) return false
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 // GIF8
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // RIFF…WEBP
  return jpeg || png || gif || webp
}

/**
 * Upload (upsert) bytes to the public media bucket at `key`, returning the public URL (cache-busted with `?v=`
 * so a re-upload to a stable key shows immediately). null when unconfigured or on failure (never throws).
 */
export async function uploadMedia(key: string, bytes: Uint8Array, contentType: string): Promise<string | null> {
  if (!URL_BASE || !KEY) return null
  try {
    const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${KEY}`,
        'content-type': contentType,
        'x-upsert': 'true',
        'cache-control': 'public, max-age=31536000, immutable',
      },
      body: bytes as BodyInit,
    })
    if (!res.ok) {
      console.error('[storage] media upload failed:', res.status, await res.text().catch(() => ''))
      return null
    }
    return `${URL_BASE}/storage/v1/object/public/${BUCKET}/${key}?v=${Date.now()}`
  } catch (e) {
    console.error('[storage] media upload error:', (e as Error).message)
    return null
  }
}
