'use client';

import { useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { Lock, ChevronRight, Loader2 } from 'lucide-react';

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
      setError('ACCESS_DENIED: INVALID_KEY_SIGNAL');
    }
    setIsLoading(false);
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 font-mono">
        <div className="w-full max-w-md space-y-12">
          <div className="text-center space-y-4">
            <div className="flex justify-center mb-6">
              <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg">
                <Lock className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter text-foreground">Identity_Protocol</h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.4em]">Administrative Access Required</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="relative group">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ENTER_GATE_KEY"
                required
                className="w-full h-14 bg-card border border-border rounded-md px-6 text-center text-[11px] font-black uppercase tracking-[0.3em] text-foreground focus:outline-none focus:border-primary/50 transition-all shadow-xl"
              />
            </div>

            {error && (
              <p className="text-destructive text-[10px] font-black uppercase tracking-widest text-center animate-flicker">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 bg-primary text-primary-foreground font-black uppercase tracking-[0.3em] text-[10px] hover:bg-primary/90 transition-all flex items-center justify-center gap-3 group disabled:opacity-50 rounded-md shadow-lg shadow-primary/20"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Verify_Access <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
          
          <p className="text-center text-[9px] text-muted-foreground/40 uppercase tracking-[0.2em]">
            Unauthorized access attempts are logged_
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-12">
      {children}
    </div>
  );
}
