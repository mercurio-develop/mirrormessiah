import { Loader2 } from 'lucide-react';

export default function LearnLoading() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-12 w-12 text-primary animate-spin" />
      <p className="text-xs font-black uppercase tracking-[0.25em] text-white/70">
        Loading next
      </p>
    </div>
  );
}
