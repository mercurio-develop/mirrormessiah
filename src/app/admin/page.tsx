import Link from 'next/link';
import { isAdminKeyConfigured } from '@/lib/auth';
import { Database, Settings, ShieldAlert, Cpu, Film, ChevronRight, Copy, LayoutDashboard, PlusCircle, Tv } from 'lucide-react';

export default function AdminPage() {
  const adminKeyConfigured = isAdminKeyConfigured();

  return (
    <div className="flex flex-col gap-12 font-sans">
      <div className="flex flex-col gap-4 border-l-4 border-primary pl-6 py-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground leading-none">System Dashboard</h1>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] leading-none opacity-60">Control Center // Overview</p>
      </div>

      {!adminKeyConfigured && (
        <div className="p-6 bg-destructive/5 border border-destructive/20 flex items-center gap-6 rounded-2xl">
          <div className="p-4 border border-destructive/50 text-destructive bg-destructive/10 rounded-xl">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-black uppercase tracking-widest text-destructive">Configuration Required</h3>
            <p className="text-sm text-muted-foreground font-medium">
              The ADMIN_KEY is not configured. Dashboard access and management tools require this key to be set in your environment variables.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <Link href="/admin/movies" className="group">
          <div className="p-8 bg-card border border-border hover:border-primary/50 transition-all duration-300 rounded-2xl hover:shadow-2xl hover:shadow-primary/5 flex flex-col justify-between h-full">
            <div className="space-y-6">
              <div className="p-4 bg-primary/10 border border-primary/20 text-primary w-fit rounded-2xl group-hover:scale-110 transition-transform">
                <Film className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2 group-hover:text-primary transition-colors">
                  Movie Registry <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Manage your library, update metadata, and organize your media collection.
                </p>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-border/50 flex items-center justify-between text-[10px] font-black uppercase tracking-widest opacity-30">
               <span>Library Manager</span>
               <PlusCircle className="h-3 w-3" />
            </div>
          </div>
        </Link>

        <Link href="/admin/series" className="group">
          <div className="p-8 bg-card border border-border hover:border-blue-500/50 transition-all duration-300 rounded-2xl hover:shadow-2xl hover:shadow-blue-500/5 flex flex-col justify-between h-full">
            <div className="space-y-6">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 text-blue-500 w-fit rounded-2xl group-hover:scale-110 transition-transform">
                <Tv className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2 group-hover:text-blue-500 transition-colors">
                  Series Registry <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Manage your TV shows, update episodes, and organize seasons.
                </p>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-border/50 flex items-center justify-between text-[10px] font-black uppercase tracking-widest opacity-30">
               <span>Library Manager</span>
               <PlusCircle className="h-3 w-3" />
            </div>
          </div>
        </Link>

        <Link href="/admin/terminal" className="group">
          <div className="p-8 bg-card border border-border hover:border-purple-500/50 transition-all duration-300 rounded-2xl hover:shadow-2xl hover:shadow-purple-500/5 flex flex-col justify-between h-full">
            <div className="space-y-6">
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 text-purple-500 w-fit rounded-2xl group-hover:scale-110 transition-transform">
                <Settings className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2 group-hover:text-purple-500 transition-colors">
                  System Terminal <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Run synchronization, metadata scraping, and conversion scripts directly from the browser.
                </p>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-border/50 flex items-center justify-between text-[10px] font-black uppercase tracking-widest opacity-30">
               <span>Script Execution</span>
               <Database className="h-3 w-3" />
            </div>
          </div>
        </Link>
      </div>

      {/* Maintenance Cards */}
      <div className="space-y-6 pt-12">
        <div className="flex items-center gap-4">
          <Cpu className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground/60">System Maintenance</h3>
          <div className="h-px flex-1 bg-border/50" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 bg-card/50 border border-border rounded-2xl space-y-4">
            <div className="text-[10px] font-black text-primary uppercase tracking-widest">Authentication</div>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">Update the <code className="text-foreground bg-muted px-1.5 py-0.5 font-bold rounded">GATE_KEY</code> for general entry and <code className="text-foreground bg-muted px-1.5 py-0.5 font-bold rounded">ADMIN_KEY</code> for administrative dashboard access.</p>
          </div>
          <div className="p-6 bg-card/50 border border-border rounded-2xl space-y-4">
            <div className="text-[10px] font-black text-primary uppercase tracking-widest">Media Assets</div>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">Posters and backdrops are automatically linked during scanning. Manual sync is available via the CLI tools.</p>
          </div>
          <div className="p-6 bg-card/50 border border-border rounded-2xl space-y-4">
            <div className="text-[10px] font-black text-primary uppercase tracking-widest">Command Line</div>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">Use the provided Python scripts for bulk metadata enrichment and deep library synchronization.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
