'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LogOut, Film, Shield, Terminal, Sparkles, Menu, X as CloseIcon } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import ThemeToggle from './ui/ThemeToggle';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAdmin, isDevelopment, logout, logoutAdmin } = useAdmin();
  const [mounted, setMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close menu on navigation
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex justify-between items-center">
        <div className="flex items-center gap-4 sm:gap-10">
          <Link href="/" className="flex items-center gap-2 group transition-transform active:scale-95 shrink-0">
             <div className="relative">
                <Film className="w-7 h-7 sm:w-8 sm:h-8 text-primary group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-primary/20 blur-xl scale-150 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
             </div>
            <span className="text-xl sm:text-2xl font-bold tracking-tighter text-foreground uppercase">
              Mirror<span className="text-primary">Messiah</span>
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-8">
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

        <div className="flex items-center gap-1 sm:gap-6">
          <div className="hidden sm:flex items-center gap-2">
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
          
          <div className="hidden sm:block h-6 w-px bg-border/50 mx-2" />
          
          <div className="flex items-center">
            <ThemeToggle />
            
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 pl-2 pr-1 text-sm font-semibold text-muted-foreground hover:text-destructive transition-all group"
              aria-label="Logout"
            >
              <span className="hidden xl:inline group-hover:translate-x-0.5 transition-transform">Sign Out</span>
              <div className="p-2 rounded-full group-hover:bg-destructive/10 transition-colors">
                <LogOut className="w-5 h-5" />
              </div>
            </button>

            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 ml-1 rounded-full hover:bg-muted text-foreground transition-colors"
              aria-label="Toggle Menu"
            >
              {isMenuOpen ? <CloseIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <div className={`lg:hidden fixed inset-x-0 top-20 bg-background/95 backdrop-blur-2xl border-b border-border transition-all duration-500 ease-in-out origin-top overflow-hidden ${isMenuOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Link 
              href="/" 
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all ${pathname === '/' && !isFamilyMode ? 'bg-primary/10 border-primary text-primary' : 'bg-muted/50 border-border text-muted-foreground'}`}
            >
              <Film className="w-6 h-6" />
              <span className="text-xs font-bold uppercase tracking-widest">Browse</span>
            </Link>
            <button 
              onClick={toggleFamilyMode}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all ${isFamilyMode ? 'bg-green-600/10 border-green-500 text-green-500' : 'bg-muted/50 border-border text-muted-foreground'}`}
            >
              <Sparkles className="w-6 h-6" />
              <span className="text-xs font-bold uppercase tracking-widest">{isFamilyMode ? 'Family On' : 'Family Off'}</span>
            </button>
          </div>

          {mounted && isDevelopment && (
            <button 
              onClick={handleAdminToggle}
              className={`w-full flex items-center justify-center gap-3 p-4 rounded-2xl border font-bold uppercase tracking-[0.2em] text-[10px] transition-all ${isAdmin ? 'bg-primary/10 border-primary text-primary shadow-[0_0_20px_rgba(56,189,248,0.1)]' : 'bg-muted/50 border-border text-muted-foreground'}`}
            >
              <Shield className="w-5 h-5" />
              {isAdmin ? 'Exit Administrative Sector' : 'Enter Administrative Sector'}
            </button>
          )}

          {mounted && isAdmin && isDevelopment && (
            <Link 
                href="/admin" 
                className={`w-full flex items-center justify-center gap-3 p-4 rounded-2xl border font-bold uppercase tracking-[0.2em] text-[10px] transition-all ${pathname.startsWith('/admin') ? 'bg-primary/10 border-primary text-primary' : 'bg-muted/50 border-border text-muted-foreground'}`}
            >
              <Terminal className="w-5 h-5" />
              Command Center Dashboard
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
