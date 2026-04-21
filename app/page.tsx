import PublicMoviesList from '@/components/PublicMoviesList'
import { getMovies } from '@/features/movie/queries/get-movies';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { movies: initialMovies } = getMovies({ limit: 24 });

  return (
    <div className="flex flex-col min-h-screen bg-background font-sans selection:bg-primary selection:text-primary-foreground">
      {/* Cinematic grid background */}
      <div className="fixed inset-0 z-0 opacity-10 pointer-events-none data-grid" />
      
      <header className="relative z-10 pt-16 pb-8 px-6 max-w-7xl mx-auto w-full">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic text-foreground leading-none">
            Mirror<span className="text-primary">Messiah</span>
          </h1>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest pl-1">
            Sector_Registry // Local_Archives
          </p>
        </div>
      </header>

      <main className="relative z-10 flex flex-col gap-12 pb-24 px-6 max-w-7xl mx-auto w-full">
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-border to-transparent" />
        <PublicMoviesList initialMovies={initialMovies} />
      </main>
    </div>
  )
}
