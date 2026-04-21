'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Film, Shield, Terminal, ShieldAlert } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAdmin, logout } = useAdmin();

  if (pathname === '/login') return null;

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <nav className="bg-background/80 backdrop-blur-md border-b border-border py-3 px-6 sticky top-0 z-[100] flex justify-between items-center font-mono transition-colors">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 bg-primary/10 border border-primary/20 rounded-md flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
            <Film className="w-5 h-5" />
          </div>
          <span className="text-base font-black uppercase italic tracking-tighter text-foreground">
            Mirror<span className="text-primary">Messiah</span>
          </span>
        </Link>
        
        <Link 
          href="/admin" 
          className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border rounded-md transition-all ${
            isAdmin 
              ? 'bg-primary/20 border-primary/50 text-primary' 
              : 'bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          {isAdmin ? <Shield className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />}
          {isAdmin ? 'System_Authorized' : 'Terminal_Access'}
        </Link>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        {isAdmin && (
          <>
            <Link 
              href="/admin/movies/new" 
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-all flex items-center gap-2 group"
            >
              <Shield className="w-4 h-4 group-hover:text-primary transition-colors" /> <span className="hidden md:inline">Register_Entity</span>
            </Link>
          </>
        )}
        
        <div className="h-4 w-[1px] bg-border mx-1" />
        
        <ThemeToggle />
        
        <button 
          onClick={handleLogout}
          className="text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-destructive transition-all flex items-center gap-2 group"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4 group-hover:text-destructive transition-colors" /> <span className="hidden sm:inline">Terminate_Session</span>
        </button>
      </div>
    </nav>
  );
}
