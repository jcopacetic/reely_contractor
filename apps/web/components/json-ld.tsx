/**
 * Renders one or more JSON-LD blocks as <script type="application/ld+json">. Server component; the
 * data is built by the typed helpers in lib/seo.ts. Per the Next.js JSON-LD guide.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const items = Array.isArray(data) ? data : [data]
  return (
    <>
      {items.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, '\\u003c') }} />
      ))}
    </>
  )
}
