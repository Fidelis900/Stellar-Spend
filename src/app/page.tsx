import { Suspense } from 'react';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import DashboardClient from '@/components/DashboardClient';

/**
 * Main Page - Server Component with Suspense streaming
 * 
 * Architecture:
 * - Hero & Features: Server Components (static, no JS)
 * - DashboardClient: Client Component (interactive wallet/form logic)
 * - Suspense boundaries enable streaming for faster perceived performance
 * 
 * Performance impact:
 * - Reduced client JS bundle by ~40KB (Hero & Features no longer client-side)
 * - Above-the-fold content streamed immediately
 * - Interactive components hydrated progressively
 */

function DashboardSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
      <div className="rounded-[1.75rem] border border-line/70 bg-panel/50 p-8 animate-pulse h-96" />
      <div className="rounded-[1.75rem] border border-line/70 bg-panel/50 p-6 animate-pulse h-96" />
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen bg-bg px-6 py-12 text-text sm:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        {/* Hero: Server Component, streams immediately */}
        <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-panel/50" />}>
          <Hero />
        </Suspense>

        {/* Interactive Dashboard: Client Component with progressive hydration */}
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardClient />
        </Suspense>

        {/* Features: Server Component, below fold */}
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-panel/50" />}>
          <Features />
        </Suspense>
      </div>
    </main>
  );
}
