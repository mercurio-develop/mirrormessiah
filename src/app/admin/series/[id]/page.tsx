import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminSeriesForm from '@/features/series/components/AdminSeriesForm';
import { getSeriesDetails } from '@/features/series/queries/get-series-details';
import { ChevronLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface SeriesEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function SeriesEditPage({ params }: SeriesEditPageProps) {
  const { id } = await params;
  const seriesId = parseInt(id);
  if (isNaN(seriesId)) notFound();

  const series = getSeriesDetails(seriesId);
  if (!series) notFound();

  return (
    <div className="flex flex-col gap-12 font-mono pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-l-4 border-blue-500 pl-6 py-2">
        <div className="space-y-2">
          <Link 
            href="/admin/series" 
            className="text-blue-500 hover:text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-2 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" /> Back_to_Registry
          </Link>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">Entity_Editor</h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.4em]">Registry_Node: 0x{seriesId.toString(16).toUpperCase()} // {series.title}</p>
        </div>
      </div>

      <div className="terminal-border p-8 /50 backdrop-blur-xl border-white/5">
        <AdminSeriesForm series={series} />
      </div>
    </div>
  );
}
