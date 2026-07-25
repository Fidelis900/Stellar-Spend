/**
 * Backwards-compatible alias for the shared skeleton primitive.
 *
 * The canonical implementation now lives in
 * `@/components/skeletons/SkeletonBase` so there is a single shared shimmer
 * source. This re-export keeps the historical `@/components/ui/Skeleton`
 * import path working for existing callers.
 */
export {
  SkeletonBase as Skeleton,
  type SkeletonBaseProps as SkeletonProps,
} from "@/components/skeletons/SkeletonBase";
