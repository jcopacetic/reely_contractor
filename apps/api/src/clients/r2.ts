/**
 * Cloudflare R2 (S3-compatible) — screenshot storage for the plugin-timer evidence. The extension uploads
 * straight to R2 via a short-lived presigned PUT; screenshots (PII) are served only via short-lived presigned
 * GET URLs, never public. Stubs (returns null) when the R2 env is unset, so local/dev runs without object storage.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../env'

let cached: { s3: S3Client; bucket: string } | null | undefined
function client(): { s3: S3Client; bucket: string } | null {
  if (cached !== undefined) return cached
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    cached = null
    return null
  }
  cached = {
    s3: new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    }),
    bucket: R2_BUCKET,
  }
  return cached
}

export const r2Configured = (): boolean => client() !== null

/** Short-lived presigned PUT URL — the extension uploads a screenshot straight to R2. Null if unconfigured. */
export async function presignPut(key: string, contentType = 'image/jpeg'): Promise<string | null> {
  const c = client()
  if (!c) return null
  return getSignedUrl(c.s3, new PutObjectCommand({ Bucket: c.bucket, Key: key, ContentType: contentType }), { expiresIn: 300 })
}

/** Short-lived presigned GET URL to view a screenshot. Null if unconfigured or no key. */
export async function presignGet(key: string | null): Promise<string | null> {
  if (!key) return null
  const c = client()
  if (!c) return null
  return getSignedUrl(c.s3, new GetObjectCommand({ Bucket: c.bucket, Key: key }), { expiresIn: 600 })
}
