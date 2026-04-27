import Link from 'next/link';
import AdminSeriesList from '@/features/series/components/AdminSeriesList';
import { ChevronLeft, Tv, List } from 'lucide-react';
import { getSeriesList } from '@/features/series/queries/get-series';

export const dynamic = 'force-dynamic';

export default async function SeriesAdminPage() {
  const { series, total } = getSeriesList({ limit: 100 });

  return (
    <div className="flex flex-col gap-10 font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <Link 
            href="/admin" 
            className="text-primary hover:text-primary/80 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-2 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div className="flex items-center gap-4">
             <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
                <Tv className="h-6 w-6" />
             </div>
             <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Series Registry</h1>
          </div>
          <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
             <List className="h-4 w-4 opacity-40" />
             Collection Size: <span className="text-foreground font-bold">{total} total series</span>
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm p-6">
        <AdminSeriesList initialSeries={series} />
      </div>
    </div>
  );
}
