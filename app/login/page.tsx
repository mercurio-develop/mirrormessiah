'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ChevronRight, Loader2, ShieldCheck, Zap } from 'lucide-react';

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
        setError('ACCESS DENIED: INVALID KEY');
      }
    } catch (err) {
      setError('CONNECTION ERROR: PLEASE RETRY');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden font-sans selection:bg-primary selection:text-white">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none cinematic-grid" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-30 blur-3xl pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-10 space-y-6">
          <div className="flex justify-center">
            <div className="p-5 bg-primary/10 border border-primary/20 rounded-3xl group shadow-[0_0_30px_rgba(56,189,248,0.1)]">
              <Lock className="h-10 w-10 text-primary group-hover:scale-110 transition-transform duration-500" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tighter uppercase italic text-foreground leading-none">
                Private<span className="text-primary">Archive</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">Secure Access Point</p>
          </div>
        </div>

        <div className="bg-card/40 backdrop-blur-3xl border border-border p-8 rounded-3xl shadow-2xl space-y-8">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Authentication Required</label>
                    <div className="relative group">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter access key..."
                            required
                            autoFocus
                            className="w-full h-14 bg-background/50 border border-border rounded-xl px-6 text-center text-sm font-bold tracking-[0.3em] text-foreground placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                        />
                    </div>
                </div>

                {error && (
                    <p className="text-destructive text-[10px] font-bold uppercase tracking-widest text-center animate-pulse">
                    {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-14 bg-primary text-primary-foreground font-black uppercase tracking-[0.3em] text-[11px] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 group disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-primary/20 rounded-xl"
                >
                    {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                    <>
                        Unlock Session <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </>
                    )}
                </button>
            </form>
            
            <div className="pt-4 flex flex-col items-center gap-4">
                <div className="flex items-center gap-6 text-muted-foreground/20">
                    <ShieldCheck className="h-4 w-4" />
                    <div className="h-3 w-px bg-current" />
                    <Zap className="h-4 w-4" />
                </div>
            </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border/50 text-center">
           <p className="text-[9px] text-muted-foreground/30 font-black uppercase tracking-[0.3em]">
             MirrorMessiah Premium Media Registry
           </p>
        </div>
      </div>
    </div>
  );
}
