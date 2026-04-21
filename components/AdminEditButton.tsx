'use client';

import Link from 'next/link';
import { Edit } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';

export default function AdminEditButton({ movieId }: { movieId: number }) {
  const { isAdmin } = useAdmin();

  if (!isAdmin) return null;

  return (
    <div className="mt-8">
      <Link 
        href={`/admin/movies/${movieId}`}
        className="flex items-center justify-center gap-2 w-full py-4 bg-muted hover:bg-muted/80 text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
      >
        <Edit className="h-4 w-4" /> Edit Entry
      </Link>
    </div>
  );
}
