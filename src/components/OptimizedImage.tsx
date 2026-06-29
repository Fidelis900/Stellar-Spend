"use client";

import Image, { ImageProps } from "next/image";
import { memo } from "react";
import { imageConfigs as baseImageConfigs, ImageOptimizationConfig } from "@/lib/image-optimization";

// Extend base configs with AVIF variant
const imageConfigs = {
  ...baseImageConfigs,
  avif: {
    sizes: "(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px",
    quality: 80,
    priority: false,
  },
} as const;

type ImageVariant = keyof typeof imageConfigs;

interface OptimizedImageProps extends Omit<ImageProps, "alt"> {
  alt: string;
  variant?: ImageVariant;
  config?: ImageOptimizationConfig;
}

/**
 * Optimized Image component with AVIF/WebP support, LCP optimization, and lazy loading.
 */
const OptimizedImage = memo(function OptimizedImage({
  variant = "card",
  config,
  ...props
}: OptimizedImageProps) {
  const mergedConfig = {
    ...imageConfigs[variant],
    ...config,
  };

  const isPriority = mergedConfig.priority ?? props.priority ?? false;

  return (
    <Image
      {...props}
      alt={props.alt}
      sizes={mergedConfig.sizes}
      quality={mergedConfig.quality}
      placeholder={mergedConfig.placeholder}
      priority={isPriority}
      loading={isPriority ? "eager" : "lazy"}
      decoding={isPriority ? undefined : "async"}
      // @ts-expect-error fetchpriority is a valid HTML attribute not yet in React types
      fetchpriority={isPriority ? "high" : undefined}
    />
  );
});

export default OptimizedImage;
