'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LogOut, Film, Shield, Terminal, Sparkles } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import ThemeToggle from './ui/ThemeToggle';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAdmin, isDevelopment, logout, logoutAdmin } = useAdmin();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isFamilyMode = searchParams.get('audience') === 'family';

  const toggleFamilyMode = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (isFamilyMode) {
      params.delete('audience');
    } else {
      params.set('audience', 'family');
    }
    const targetPath = pathname === '/' ? '' : '/';
    router.push(`${targetPath}?${params.toString()}`);
  };

  const handleAdminToggle = async () => {
    if (isAdmin) {
      await logoutAdmin();
      if (pathname.startsWith('/admin')) {
        router.push('/');
      }
    } else {
      router.push('/admin');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Sign_Out_Failure:', error);
    }
  };

  if (pathname === '/login') return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] transition-all duration-500 glass-effect">
      <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-2 group transition-transform active:scale-95">
             <div className="relative">
                <Film className="w-8 h-8 text-primary group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-primary/20 blur-xl scale-150 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
             </div>
            <span className="text-2xl font-bold tracking-tighter text-foreground uppercase">
              Mirror<span className="text-primary">Messiah</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link 
              href="/" 
              className={`text-sm font-semibold transition-colors hover:text-primary ${pathname === '/' && !isFamilyMode ? 'text-primary' : 'text-muted-foreground'}`}
            >
              Browse
            </Link>
            <button 
              onClick={toggleFamilyMode}
              className={`text-sm font-bold transition-all px-4 py-1.5 rounded-full border flex items-center gap-2 ${isFamilyMode ? 'bg-green-600 border-green-500 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)]' : 'bg-green-600/10 border-green-600/20 text-green-500 hover:bg-green-600/20'}`}
            >
              <Sparkles className="w-4 h-4" /> {isFamilyMode ? 'Family Active' : 'Family Mode'}
            </button>
            {mounted && isAdmin && isDevelopment && (
               <Link 
                href="/admin" 
                className={`text-sm font-semibold transition-colors hover:text-primary ${pathname.startsWith('/admin') ? 'text-primary' : 'text-muted-foreground'}`}
              >
                Dashboard
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            {mounted && isDevelopment && (
               <button 
                onClick={handleAdminToggle}
                className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded-full transition-all ${
                    isAdmin 
                    ? 'bg-primary/20 border-primary/50 text-primary shadow-[0_0_15px_rgba(56,189,248,0.2)]' 
                    : 'bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                {isAdmin ? 'Admin Active' : 'Admin Mode'}
              </button>
            )}
          </div>
          
          <div className="h-6 w-px bg-border/50 mx-2" />
          
          <ThemeToggle />
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 pl-2 pr-1 text-sm font-semibold text-muted-foreground hover:text-destructive transition-all group"
            aria-label="Logout"
          >
            <span className="hidden sm:inline group-hover:translate-x-0.5 transition-transform">Sign Out</span>
            <div className="p-2 rounded-full group-hover:bg-destructive/10 transition-colors">
              <LogOut className="w-5 h-5" />
            </div>
          </button>
        </div>
      </div>
    </nav>
  );
}
