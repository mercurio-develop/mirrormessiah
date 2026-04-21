import PublicMoviesList from '@/components/PublicMoviesList'
import { getMovies } from '@/features/movie/queries/get-movies';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { movies: initialMovies } = getMovies({ limit: 24 });

  return (
    <div className="flex flex-col min-h-screen bg-background font-sans selection:bg-primary selection:text-white pt-24">
      {/* Dynamic Grid Background */}
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none cinematic-grid" />
      
      <main className="relative z-10 flex flex-col gap-12 pb-24 max-w-7xl mx-auto w-full">
        <header className="pt-12 px-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-5xl font-black tracking-tighter uppercase italic text-foreground leading-none">
              Mirror<span className="text-primary">Messiah</span>
            </h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.3em] opacity-40">
              Global Archives // Sector 01
            </p>
          </div>
        </header>

        <Suspense fallback={<div className="px-6 text-muted-foreground animate-pulse font-bold">Synchronizing Archives...</div>}>
          <PublicMoviesList initialMovies={initialMovies} />
        </Suspense>
      </main>
    </div>
  )
}
