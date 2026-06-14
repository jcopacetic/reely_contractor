'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Camera, X } from 'lucide-react'
import { uploadAvatarAction } from '@/app/contractor/actions'

const VIEWPORT = 256 // on-screen crop square (px)
const OUTPUT = 512 // exported avatar edge (px)

/** Encode a canvas to a small WebP blob (falls back to JPEG where WebP encode is unsupported). */
function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => (b ? resolve(b) : canvas.toBlob((j) => resolve(j), 'image/jpeg', 0.9)), 'image/webp', 0.9)
  })
}

/**
 * Profile avatar picker with an in-browser square crop. The user picks a file, pans/zooms inside a circular
 * viewport, and we export a downscaled WebP — so only a small, consistent square leaves the browser. On save it
 * uploads to contractor's Supabase 'media' bucket and persists avatarUrl on the profile (server action).
 */
export function AvatarUploader({ initialUrl, displayName }: { initialUrl: string | null; displayName?: string }) {
  const [url, setUrl] = useState(initialUrl)
  const [src, setSrc] = useState<string | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [pending, setPending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const cover = img ? VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight) : 1
  const scale = cover * zoom
  const dispW = img ? img.naturalWidth * scale : 0
  const dispH = img ? img.naturalHeight * scale : 0

  const clamp = useCallback(
    (o: { x: number; y: number }) => ({ x: Math.min(0, Math.max(VIEWPORT - dispW, o.x)), y: Math.min(0, Math.max(VIEWPORT - dispH, o.y)) }),
    [dispW, dispH],
  )

  useEffect(() => {
    if (img) setOffset(clamp({ x: (VIEWPORT - dispW) / 2, y: (VIEWPORT - dispH) / 2 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom])

  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(null)
    const objectUrl = URL.createObjectURL(f)
    const image = new Image()
    image.onload = () => { setImg(image); setSrc(objectUrl); setZoom(1) }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); setErr('Could not read that image.') }
    image.src = objectUrl
    e.target.value = ''
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }))
  }
  function onPointerUp() { drag.current = null }

  function close() {
    if (src) URL.revokeObjectURL(src)
    setSrc(null); setImg(null); setErr(null)
  }

  async function save() {
    if (!img) return
    setPending(true); setErr(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT; canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no-canvas')
      const s = scale
      ctx.drawImage(img, -offset.x / s, -offset.y / s, VIEWPORT / s, VIEWPORT / s, 0, 0, OUTPUT, OUTPUT)
      const blob = await toBlob(canvas)
      if (!blob) throw new Error('encode')
      const fd = new FormData()
      fd.append('image', blob, blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg')
      const r = await uploadAvatarAction(fd)
      if ('ok' in r) { setUrl(r.url); close() }
      else setErr(r.error === 'storage' ? 'Image storage isn’t configured yet.' : r.error === 'forbidden' ? 'Only vetted contractors can upload.' : 'Upload failed — try again.')
    } catch {
      setErr('Something went wrong preparing the image.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-16 rounded-full border border-border object-cover" />
      ) : (
        <div className="grid size-16 place-items-center rounded-full bg-primary/10 font-display text-2xl font-bold text-primary">{(displayName ?? '?').charAt(0).toUpperCase()}</div>
      )}
      <div>
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">
          <Camera className="size-4" /> {url ? 'Change photo' : 'Upload photo'}
        </button>
        <p className="mt-1 text-xs text-muted-foreground">A square headshot for your public profile.</p>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} className="hidden" />

      {src && img && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Crop your photo</h3>
              <button type="button" onClick={close} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div
              className="relative mx-auto touch-none overflow-hidden rounded-full border border-border bg-muted"
              style={{ width: VIEWPORT, height: VIEWPORT }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" draggable={false} className="pointer-events-none max-w-none select-none" style={{ width: dispW, height: dispH, transform: `translate(${offset.x}px, ${offset.y}px)`, transformOrigin: 'top left' }} />
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              Zoom
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="grow" />
            </label>
            {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={close} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">Cancel</button>
              <button type="button" onClick={save} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {pending && <Loader2 className="size-4 animate-spin" />} Save photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
