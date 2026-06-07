import { PublicSeriesList } from '@/features/series/components/public-series-list'
import { getSeriesList } from '@/features/series/queries/get-series';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function SeriesPage() {
  const { series: initialSeries } = getSeriesList({ limit: 24 });

  return (
    <div className="flex flex-col min-h-screen bg-background font-sans selection:bg-primary selection:text-white pt-18">
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none cinematic-grid" />
      
      <main className="relative z-10 flex flex-col gap-12 pb-12 max-w-7xl mx-auto w-full">
        <Suspense fallback={<div className="px-6 text-muted-foreground animate-pulse font-bold">Synchronizing Archives...</div>}>
          <PublicSeriesList initialSeries={initialSeries} />
        </Suspense>
      </main>
    </div>
  )
}
