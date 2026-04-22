import PublicMoviesList from '@/features/movie/components/PublicMoviesList'
import { getMovies } from '@/features/movie/queries/get-movies';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { movies: initialMovies } = getMovies({ limit: 24 });

  return (
    <div className="flex flex-col min-h-screen bg-background font-sans selection:bg-primary selection:text-white pt-18">
      {/* Dynamic Grid Background */}
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none cinematic-grid" />
      
      <main className="relative z-10 flex flex-col gap-12 pb-12 max-w-7xl mx-auto w-full">
        <Suspense fallback={<div className="px-6 text-muted-foreground animate-pulse font-bold">Synchronizing Archives...</div>}>
          <PublicMoviesList initialMovies={initialMovies} />
        </Suspense>
      </main>
    </div>
  )
}
