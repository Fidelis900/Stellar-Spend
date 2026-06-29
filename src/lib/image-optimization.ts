/**
 * Image optimization utilities for Next.js Image component.
 * Provides helpers for responsive images, lazy loading, and format optimization.
 */

export interface ImageOptimizationConfig {
  sizes?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: "blur" | "empty";
}

/**
 * Get responsive image sizes for different breakpoints.
 * Optimizes for mobile-first design.
 */
export const getResponsiveSizes = (maxWidth: number = 1200): string => {
  return [
    "(max-width: 640px) 100vw",
    "(max-width: 1024px) 90vw",
    `${Math.min(maxWidth, 1200)}px`,
  ].join(", ");
};

/**
 * Get optimized image configuration for common use cases.
 */
export const imageConfigs = {
  thumbnail: {
    sizes: "(max-width: 640px) 100px, 150px",
    quality: 75,
    placeholder: "blur" as const,
  },
  card: {
    sizes: getResponsiveSizes(400),
    quality: 80,
    placeholder: "blur" as const,
  },
  hero: {
    sizes: getResponsiveSizes(1200),
    quality: 85,
    placeholder: "blur" as const,
    priority: true,
  },
  icon: {
    sizes: "64px",
    quality: 90,
  },
} as const;

/**
 * Generate srcSet for responsive images.
 * Supports WebP and fallback formats.
 */
export const generateSrcSet = (
  basePath: string,
  widths: number[] = [320, 640, 960, 1280, 1920],
): string => {
  return widths
    .map((width) => `${basePath}?w=${width}&q=75 ${width}w`)
    .join(", ");
};

/**
 * Get image loader for CDN optimization.
 * Prefers AVIF, falls back to WebP.
 */
export const imageLoader = (
  src: string,
  width: number,
  quality: number = 75,
  format: "avif" | "webp" = "avif",
): string => {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (cdnUrl && !src.startsWith("http")) {
    const params = new URLSearchParams({
      w: width.toString(),
      q: quality.toString(),
      f: format,
    });
    return `${cdnUrl}${src}?${params.toString()}`;
  }
  return src;
};

/**
 * Generate AVIF srcSet for responsive images (preferred format).
 */
export const generateAvifSrcSet = (
  basePath: string,
  widths: number[] = [320, 640, 960, 1280, 1920],
  quality: number = 80,
): string => {
  return widths
    .map((width) => `${basePath}?w=${width}&q=${quality}&f=avif ${width}w`)
    .join(", ");
};

/**
 * Returns <link rel="preload"> descriptor objects for critical fonts/assets.
 * Render these in <Head> for above-the-fold performance.
 */
export interface PreloadDescriptor {
  href: string;
  as: string;
  type?: string;
  crossOrigin?: "anonymous" | "use-credentials";
}

export const getCriticalAssetPreloads = (): PreloadDescriptor[] => [
  {
    href: "/fonts/inter-var.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
];

/**
 * Asset size budgets (bytes). Fail CI if exceeded.
 */
export const assetSizeBudgets: Record<string, number> = {
  "hero-image": 100_000,   // 100 KB
  "card-image": 50_000,    // 50 KB
  "thumbnail": 20_000,     // 20 KB
  "icon": 5_000,           // 5 KB
  "font-woff2": 150_000,   // 150 KB
};

/**
 * Returns true if the asset is within budget; throws with a descriptive message if not.
 */
export const checkAssetSizeBudget = (assetPath: string, sizeBytes: number): boolean => {
  const key = Object.keys(assetSizeBudgets).find((k) => assetPath.includes(k));
  if (!key) return true;
  const limit = assetSizeBudgets[key];
  if (sizeBytes > limit) {
    throw new Error(
      `Asset "${assetPath}" is ${sizeBytes} bytes, exceeds budget of ${limit} bytes for category "${key}".`,
    );
  }
  return true;
};

/**
 * Preload critical images for better LCP.
 */
export const preloadImage = (src: string, as: "image" = "image"): void => {
  if (typeof window === "undefined") return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = as;
  link.href = src;
  link.type = "image/webp";
  document.head.appendChild(link);
};

/**
 * Lazy load images with Intersection Observer.
 */
export const lazyLoadImage = (
  img: HTMLImageElement,
  options: IntersectionObserverInit = { rootMargin: "50px" },
): void => {
  if (!("IntersectionObserver" in window)) {
    // Fallback for browsers without IntersectionObserver
    img.src = img.dataset.src || "";
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        img.src = img.dataset.src || "";
        img.classList.add("loaded");
        observer.unobserve(img);
      }
    });
  }, options);

  observer.observe(img);
};

/**
 * Get image dimensions for aspect ratio preservation.
 */
export const getImageDimensions = (
  aspectRatio: "square" | "video" | "portrait" | "landscape" = "square",
): { width: number; height: number } => {
  const ratios = {
    square: { width: 1, height: 1 },
    video: { width: 16, height: 9 },
    portrait: { width: 3, height: 4 },
    landscape: { width: 4, height: 3 },
  };
  return ratios[aspectRatio];
};
