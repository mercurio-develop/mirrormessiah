'use client';

import Link from 'next/link';
import { Terminal, ChevronLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center space-y-8">
      <div className="relative">
        <div className="absolute inset-0 animate-ping h-16 w-16 bg-primary/20 rounded-full mx-auto" />
        <Terminal className="h-16 w-16 text-primary/40 mx-auto" />
      </div>
      <div className="space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tighter uppercase italic text-foreground">Route_Not_Found</h1>
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.3em] opacity-60">The requested sector is currently offline</p>
      </div>
      <Link 
        href="/"
        className="px-10 py-4 bg-primary text-primary-foreground text-xs font-extrabold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 rounded-2xl flex items-center gap-3"
      >
        <ChevronLeft className="h-4 w-4" /> Return to Archives
      </Link>
    </div>
  );
}
