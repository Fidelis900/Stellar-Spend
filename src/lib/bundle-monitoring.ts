import { logger } from '@/lib/logger';
/**
 * Bundle size monitoring and optimization utilities
 * Tracks bundle metrics and provides optimization recommendations
 */

interface BundleMetrics {
  totalSize: number;
  gzipSize: number;
  timestamp: Date;
  chunks: Record<string, number>;
}

interface BundleThresholds {
  totalSizeWarning: number; // bytes
  totalSizeError: number; // bytes
  gzipSizeWarning: number; // bytes
  gzipSizeError: number; // bytes
}

const DEFAULT_THRESHOLDS: BundleThresholds = {
  totalSizeWarning: 500 * 1024, // 500KB
  totalSizeError: 750 * 1024, // 750KB
  gzipSizeWarning: 150 * 1024, // 150KB
  gzipSizeError: 250 * 1024, // 250KB
};

/**
 * Log bundle metrics for monitoring
 */
export function logBundleMetrics(metrics: BundleMetrics, thresholds = DEFAULT_THRESHOLDS): void {
  const warnings: string[] = [];

  if (metrics.gzipSize > thresholds.gzipSizeError) {
    warnings.push(
      `❌ Gzip size ${formatBytes(metrics.gzipSize)} exceeds error threshold ${formatBytes(thresholds.gzipSizeError)}`,
    );
  } else if (metrics.gzipSize > thresholds.gzipSizeWarning) {
    warnings.push(
      `⚠️  Gzip size ${formatBytes(metrics.gzipSize)} exceeds warning threshold ${formatBytes(thresholds.gzipSizeWarning)}`,
    );
  }

  if (metrics.totalSize > thresholds.totalSizeError) {
    warnings.push(
      `❌ Total size ${formatBytes(metrics.totalSize)} exceeds error threshold ${formatBytes(thresholds.totalSizeError)}`,
    );
  } else if (metrics.totalSize > thresholds.totalSizeWarning) {
    warnings.push(
      `⚠️  Total size ${formatBytes(metrics.totalSize)} exceeds warning threshold ${formatBytes(thresholds.totalSizeWarning)}`,
    );
  }

  if (warnings.length > 0) {
    logger.warn('Bundle Size Warnings', { warnings: warnings.join('\n') });
  }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get optimization recommendations based on bundle metrics
 */
export function getOptimizationRecommendations(metrics: BundleMetrics): string[] {
  const recommendations: string[] = [];

  // Check for large chunks
  const largeChunks = Object.entries(metrics.chunks)
    .filter(([, size]) => size > 100 * 1024) // 100KB
    .sort(([, a], [, b]) => b - a);

  if (largeChunks.length > 0) {
    recommendations.push('Consider code splitting for large chunks:');
    largeChunks.forEach(([chunk, size]) => {
      recommendations.push(`  - ${chunk}: ${formatBytes(size)}`);
    });
  }

  if (metrics.gzipSize > 200 * 1024) {
    recommendations.push(
      'Consider dynamic imports for heavy dependencies like @allbridge/bridge-core-sdk',
    );
  }

  if (metrics.totalSize > 1024 * 1024) {
    recommendations.push('Review and remove unused dependencies');
  }

  return recommendations;
}
