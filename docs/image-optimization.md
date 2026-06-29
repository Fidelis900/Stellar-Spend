# Image Optimization — Stellar-Spend (#702)

## Format Strategy

Priority order: **AVIF → WebP → original fallback**.

`next.config.ts` sets `images.formats: ["image/avif", "image/webp"]`, so Next.js
automatically negotiates the best format the browser accepts.

The `imageLoader` helper mirrors this by accepting a `format` argument that
defaults to `"avif"`. The CDN (if `NEXT_PUBLIC_CDN_URL` is set) receives `?f=avif`
and serves the compressed asset; browsers without AVIF support get WebP via the
standard `<picture>` negotiation built into Next.js Image.

## Responsive Sizes

| Variant   | `sizes` attribute                                      | Quality |
|-----------|--------------------------------------------------------|---------|
| `thumbnail` | `(max-width: 640px) 100px, 150px`                  | 75      |
| `card`    | `(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 400px` | 80 |
| `hero`    | `(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px` | 85 |
| `icon`    | `64px`                                                 | 90      |
| `avif`    | `(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px` | 80 |

`generateAvifSrcSet(basePath, widths, quality)` produces an explicit AVIF srcSet
string for use outside the Next.js `<Image>` component.

## LCP Optimization

Pass `priority` (or `variant="hero"`) to `OptimizedImage`:

```tsx
<OptimizedImage src="/hero.avif" alt="…" variant="hero" priority />
```

When `priority` is truthy the component:
- sets `loading="eager"` (no lazy-loading deferral)
- sets `fetchpriority="high"` so the browser pre-fetches this resource at high
  network priority
- omits `decoding="async"` so the image is decoded synchronously and painted sooner

Non-priority images always receive `decoding="async"` to avoid blocking the main thread.

For critical fonts, call `getCriticalAssetPreloads()` in your root layout to obtain
`<link rel="preload">` descriptors:

```tsx
import { getCriticalAssetPreloads } from "@/lib/image-optimization";

export default function RootLayout({ children }) {
  const preloads = getCriticalAssetPreloads();
  return (
    <html>
      <head>
        {preloads.map((p) => (
          <link key={p.href} rel="preload" href={p.href} as={p.as}
                type={p.type} crossOrigin={p.crossOrigin} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

## Asset Size Budgets

`assetSizeBudgets` in `src/lib/image-optimization.ts` maps asset categories to
byte limits. `checkAssetSizeBudget(assetPath, sizeBytes)` throws if the asset
exceeds its budget — integrate this in CI image-build scripts.

| Category     | Limit  |
|--------------|--------|
| `hero-image` | 100 KB |
| `card-image` | 50 KB  |
| `thumbnail`  | 20 KB  |
| `icon`       | 5 KB   |
| `font-woff2` | 150 KB |

## Adding New Image Configs

1. Add an entry to `imageConfigs` in `src/lib/image-optimization.ts`:

```ts
export const imageConfigs = {
  // …existing entries…
  banner: {
    sizes: getResponsiveSizes(1440),
    quality: 82,
    placeholder: "blur" as const,
  },
} as const;
```

2. Add a matching budget entry in `assetSizeBudgets` if you want CI enforcement.

3. Use `variant="banner"` on `<OptimizedImage>`.
