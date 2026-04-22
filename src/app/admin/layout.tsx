'use client';

import { useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { Lock, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin, login } = useAdmin();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    const success = await login(password);
    if (!success) {
      setError('ACCESS DENIED: INVALID KEY');
    }
    setIsLoading(false);
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 font-sans pt-20">
        <div className="w-full max-w-md space-y-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-6">
              <div className="p-5 bg-primary/10 border border-primary/20 rounded-3xl group">
                <Lock className="h-10 w-10 text-primary group-hover:scale-110 transition-transform duration-500" />
              </div>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground uppercase italic">Admin Access</h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.3em] opacity-60">Authentication Required for Management</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin key..."
                required
                className="w-full h-16 bg-card border border-border rounded-2xl px-8 text-center text-sm font-bold tracking-[0.2em] text-foreground focus:outline-none focus:border-primary/50 transition-all shadow-2xl"
              />
            </div>

            {error && (
              <p className="text-destructive text-xs font-bold uppercase tracking-widest text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-16 bg-primary text-primary-foreground font-extrabold uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 group disabled:opacity-50 rounded-2xl shadow-xl shadow-primary/20"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Verify Access <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
          
          <div className="pt-8 border-t border-border/50 text-center">
             <p className="text-[10px] text-muted-foreground/40 uppercase font-bold tracking-widest flex items-center justify-center gap-2">
                <ShieldCheck className="h-3 w-3" /> Secure Management Session
             </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-20">
      {children}
    </div>
  );
}
