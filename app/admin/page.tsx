import Link from 'next/link';
import { isAdminKeyConfigured } from '@/lib/auth';
import { Database, Settings, ShieldCheck, ShieldAlert, Cpu, Film, ChevronRight, Copy } from 'lucide-react';

export default function AdminPage() {
  const adminKeyConfigured = isAdminKeyConfigured();

  return (
    <div className="flex flex-col gap-12 font-mono">
      <div className="flex flex-col gap-4 border-l-4 border-primary pl-6 py-2">
        <h1 className="text-4xl font-black uppercase italic tracking-tighter text-foreground leading-none">System_Control</h1>
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.4em] leading-none">Sector: Admin_Core // Access_Level: Restricted</p>
      </div>

      {!adminKeyConfigured && (
        <div className="terminal-border p-6 bg-destructive/5 border-destructive/20 animate-pulse flex items-center gap-6 rounded-lg">
          <div className="p-4 border border-destructive/50 text-destructive bg-destructive/5">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-destructive">Identity_Verification_Protocol</h3>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-relaxed font-medium">
              CRITICAL: No authorization key detected. Administrative protocols are locked. Configure ADMIN_KEY to restore access_
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/admin/movies" className="group">
          <div className="terminal-border p-8 bg-card/50 hover:bg-accent transition-all group-active:scale-95 h-full flex flex-col justify-between border-border rounded-lg">
            <div className="flex justify-between items-start mb-8">
              <div className="p-3 bg-muted border border-border group-hover:border-primary/50 transition-colors text-foreground group-hover:text-primary rounded-md">
                <Film className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-black text-muted-foreground/60">MODULE_01</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-black text-foreground uppercase italic flex items-center gap-2">
                Treasury_Editor <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-loose">
                Access and modify the central movie registry metadata_
              </p>
            </div>
          </div>
        </Link>

        <div className="terminal-border p-8 bg-card/50 border-border h-full flex flex-col justify-between rounded-lg">
          <div className="flex justify-between items-start mb-8">
            <div className="p-3 bg-muted border border-border text-foreground rounded-md">
              <Database className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-black text-muted-foreground/60">MODULE_02</span>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-black text-foreground uppercase italic">Registry_Pulse</h3>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              <span className="text-[10px] text-primary font-black uppercase tracking-tighter">SQLite_Active_WAL_Mode</span>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-loose">
              Local database uplink is consistent. Memory allocation optimized_
            </p>
          </div>
        </div>

        <Link href="/admin/duplicates" className="group">
          <div className="terminal-border p-8 bg-card/50 hover:bg-destructive/5 transition-all group-active:scale-95 h-full flex flex-col justify-between border-border rounded-lg">
            <div className="flex justify-between items-start mb-8">
              <div className="p-3 bg-muted border border-border group-hover:border-destructive/50 transition-colors text-foreground group-hover:text-destructive rounded-md">
                <Copy className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-black text-muted-foreground/60">MODULE_02B</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-black text-foreground uppercase italic flex items-center gap-2">
                Duplicate_Scanner <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-loose">
                Detect and purge duplicate registry entries_
              </p>
            </div>
          </div>
        </Link>

        <div className="terminal-border p-8 bg-card/50 border-border opacity-40 h-full flex flex-col justify-between cursor-not-allowed rounded-lg">
          <div className="flex justify-between items-start mb-8">
            <div className="p-3 bg-muted border border-border text-foreground rounded-md">
              <Settings className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-black text-muted-foreground/40">MODULE_03</span>
          </div>
          <div className="space-y-2 text-muted-foreground/40">
            <h3 className="text-sm font-black uppercase italic">System_Preferences</h3>
            <p className="text-[10px] uppercase tracking-widest leading-loose">
              Advanced configuration protocols are currently offline_
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Cpu className="h-4 w-4 text-primary" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-foreground">Maintenance_Directives</h3>
          <div className="h-[1px] flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 border border-border bg-card/30 backdrop-blur-sm space-y-4 rounded-lg">
            <div className="text-[10px] font-black text-primary uppercase tracking-widest">Protocol_01: Key_Sync</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed uppercase font-medium">Update ADMIN_KEY in <code className="text-foreground bg-muted px-1 font-bold rounded">.env.local</code> to override access_</p>
          </div>
          <div className="p-6 border border-border bg-card/30 backdrop-blur-sm space-y-4 rounded-lg">
            <div className="text-[10px] font-black text-primary uppercase tracking-widest">Protocol_02: Asset_Uplink</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed uppercase font-medium">Verified archives are linked directly to source media folders_</p>
          </div>
          <div className="p-6 border border-border bg-card/30 backdrop-blur-sm space-y-4 rounded-lg">
            <div className="text-[10px] font-black text-primary uppercase tracking-widest">Protocol_03: CLI_Sync</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed uppercase font-medium">Use <code className="text-foreground bg-muted px-1 font-bold rounded">python3 cli/sync_assets.py</code> for registry maintenance_</p>
          </div>
        </div>
      </div>
    </div>
  );
}
