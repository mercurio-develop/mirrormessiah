'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ChevronRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.location.href = '/';
      } else {
        setError('ACCESS_DENIED: INVALID_KEY');
      }
    } catch (err) {
      setError('UPLINK_ERROR: RETRY_SIGNAL');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden font-mono selection:bg-primary selection:text-primary-foreground">
      {/* Cinematic grid background */}
      <div className="absolute inset-0 z-0 data-grid opacity-20 pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-12 space-y-4">
          <div className="flex justify-center mb-8">
            <div className="p-6 border-2 border-primary/20 bg-primary/5 animate-pulse relative rounded-lg">
              <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-primary" />
              <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-primary" />
              <Lock className="h-10 w-10 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tighter italic uppercase text-foreground leading-none">The_Gate</h1>
          <p className="text-muted-foreground/40 text-[10px] font-black tracking-widest uppercase">Sector_Entry_Point</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="relative group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ENTER_GATE_KEY"
              required
              className="w-full h-16 bg-card border border-border rounded-md px-6 text-center text-sm font-bold uppercase tracking-[0.3em] text-foreground placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/50 focus:ring-0 transition-all shadow-xl"
            />
          </div>

          {error && (
            <p className="text-destructive text-[11px] font-black uppercase tracking-widest text-center animate-flicker">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-16 bg-primary text-primary-foreground font-black uppercase tracking-[0.3em] text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(139,92,246,0.3)] rounded-md"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Unlock_Access <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-16 pt-8 border-t border-border opacity-20">
           <p className="text-center text-[10px] text-muted-foreground font-black uppercase tracking-widest">
             MirrorMessiah_Security_Terminal_v2
           </p>
        </div>
      </div>
    </div>
  );
}
