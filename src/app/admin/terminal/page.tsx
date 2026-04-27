'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Terminal as TerminalIcon, Film, Tv, Cpu, Play, SquareSquare, AlertCircle, 
  RefreshCcw, Save, Trash2, FolderSync, PlusCircle, Activity, ArrowRight, ShieldAlert,
  ChevronRight, CheckSquare, Square
} from 'lucide-react';

type ScriptType = 'scripts/mm.py' | 'scripts/series_cli.py' | 'scripts/convert_to_web.py';
type ArgType = 'string' | 'boolean';

interface CommandArg {
  name: string;
  label: string;
  type: ArgType;
  required?: boolean;
  placeholder?: string;
  isPositional?: boolean;
}

interface CommandOptions {
  id: string;
  script: ScriptType;
  command?: string;
  description: string;
  icon: React.ReactNode;
  argsSchema?: CommandArg[];
}

const COMMANDS: Record<string, CommandOptions[]> = {
  movies: [
    { 
      id: 'm-sync', script: 'scripts/mm.py', command: 'sync', description: 'Sync Database', icon: <RefreshCcw className="w-4 h-4" />,
      argsSchema: [
        { name: 'dir', label: 'Target Directory', type: 'string', isPositional: true, placeholder: '/media/movies (optional)' },
        { name: '--category', label: 'Category', type: 'string', placeholder: 'e.g. Family' },
        { name: '--no-scrape', label: 'Skip Scraping', type: 'boolean' },
        { name: '--no-backup', label: 'Skip Backup', type: 'boolean' }
      ]
    },
    { 
      id: 'm-ingest', script: 'scripts/mm.py', command: 'ingest', description: 'Ingest Single Path', icon: <PlusCircle className="w-4 h-4" />,
      argsSchema: [
        { name: 'path', label: 'File/Folder Path', type: 'string', isPositional: true, required: true, placeholder: '/path/to/movie' },
        { name: '--category', label: 'Category', type: 'string', placeholder: 'e.g. Family' },
        { name: '--no-scrape', label: 'Skip Scraping', type: 'boolean' },
        { name: '--no-backup', label: 'Skip Backup', type: 'boolean' }
      ]
    },
    { 
      id: 'm-organize', script: 'scripts/mm.py', command: 'organize', description: 'Organize Folders', icon: <FolderSync className="w-4 h-4" />,
      argsSchema: [{ name: '--no-backup', label: 'Skip Backup', type: 'boolean' }]
    },
    { 
      id: 'm-cleanup', script: 'scripts/mm.py', command: 'cleanup', description: 'Cleanup Duplicates', icon: <Trash2 className="w-4 h-4" />,
      argsSchema: [{ name: '--no-backup', label: 'Skip Backup', type: 'boolean' }]
    },
    { 
      id: 'm-scrape', script: 'scripts/mm.py', command: 'scrape', description: 'Scrape Missing Metadata', icon: <Save className="w-4 h-4" />,
      argsSchema: [
        { name: '--force', label: 'Force Re-scrape All', type: 'boolean' },
        { name: '--dry-run', label: 'Dry Run', type: 'boolean' },
        { name: '--no-backup', label: 'Skip Backup', type: 'boolean' }
      ]
    },
    { 
      id: 'm-verify', script: 'scripts/mm.py', command: 'verify', description: 'Verify Integrity', icon: <AlertCircle className="w-4 h-4" />,
      argsSchema: [{ name: '--no-backup', label: 'Skip Backup', type: 'boolean' }]
    },
    { id: 'm-assets', script: 'scripts/mm.py', command: 'sync-assets', description: 'Sync Assets (Posters)', icon: <SquareSquare className="w-4 h-4" /> },
    { id: 'm-status', script: 'scripts/mm.py', command: 'status', description: 'Database Status', icon: <Activity className="w-4 h-4" /> },
    { 
      id: 'm-stage', script: 'scripts/mm.py', command: 'stage', description: 'Stage New Media', icon: <ArrowRight className="w-4 h-4" />,
      argsSchema: [
        { name: 'src', label: 'Source Directory', type: 'string', isPositional: true, required: true, placeholder: '/path/to/downloads' },
        { name: '--dest', label: 'Destination', type: 'string', placeholder: 'Default Media Dir' }
      ]
    },
    { 
      id: 'm-full', script: 'scripts/mm.py', command: 'full', description: 'Run Full Pipeline', icon: <Play className="w-4 h-4" />,
      argsSchema: [
        { name: '--root', label: 'Root Directory', type: 'string', placeholder: '/media/movies (optional)' },
        { name: '--category', label: 'Category', type: 'string', placeholder: 'Default category' }
      ]
    },
    {
      id: 'm-reset', script: 'scripts/mm.py', command: 'reset', description: 'Factory Reset DB', icon: <ShieldAlert className="w-4 h-4" />,
      argsSchema: [{ name: '--force', label: 'Confirm Reset', type: 'boolean', required: true }]
    }
  ],
  series: [
    { 
      id: 's-sync', script: 'scripts/series_cli.py', command: 'sync', description: 'Sync Database', icon: <RefreshCcw className="w-4 h-4" />,
      argsSchema: [{ name: 'dir', label: 'Target Directory', type: 'string', isPositional: true, placeholder: '/media/series (optional)' }]
    },
    { id: 's-organize', script: 'scripts/series_cli.py', command: 'organize', description: 'Organize Folders', icon: <FolderSync className="w-4 h-4" /> },
    { id: 's-cleanup', script: 'scripts/series_cli.py', command: 'cleanup', description: 'Cleanup Duplicates', icon: <Trash2 className="w-4 h-4" /> },
    { 
      id: 's-scrape', script: 'scripts/series_cli.py', command: 'scrape', description: 'Scrape Missing Metadata', icon: <Save className="w-4 h-4" />,
      argsSchema: [{ name: '--force', label: 'Force Re-scrape All', type: 'boolean' }]
    },
    { 
      id: 's-full', script: 'scripts/series_cli.py', command: 'full', description: 'Run Full Pipeline', icon: <Play className="w-4 h-4" />,
      argsSchema: [
        { name: 'dir', label: 'Directory', type: 'string', isPositional: true, placeholder: '/media/series (optional)' },
        { name: '--force', label: 'Force Re-scrape All', type: 'boolean' }
      ]
    },
  ],
  utils: [
    { 
      id: 'u-convert', script: 'scripts/convert_to_web.py', description: 'Convert Media to Web MP4', icon: <Cpu className="w-4 h-4" />,
      argsSchema: [
        { name: 'target', label: 'Target File/Folder', type: 'string', isPositional: true, required: true, placeholder: '/path/to/media.mkv or folder' },
        { name: '--recursive', label: 'Recursive Folder Scan', type: 'boolean' }
      ]
    },
  ]
};

export default function TerminalPage() {
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<CommandOptions | null>(null);
  const [argValues, setArgValues] = useState<Record<string, string | boolean>>({});
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const handleSelectCommand = (cmd: CommandOptions) => {
    setSelectedCommand(cmd);
    const initialVals: Record<string, string | boolean> = {};
    cmd.argsSchema?.forEach(arg => {
      initialVals[arg.name] = arg.type === 'boolean' ? false : '';
    });
    setArgValues(initialVals);
  };

  const handleArgChange = (name: string, value: string | boolean) => {
    setArgValues(prev => ({ ...prev, [name]: value }));
  };

  const runCommand = async () => {
    if (isRunning || !selectedCommand) return;
    
    let args: string[] = [];
    if (selectedCommand.argsSchema) {
      const positionals: string[] = [];
      const flags: string[] = [];

      for (const arg of selectedCommand.argsSchema) {
        const val = argValues[arg.name];
        if (arg.type === 'boolean') {
          if (val) flags.push(arg.name);
        } else if (arg.type === 'string') {
          if (val && typeof val === 'string' && val.trim() !== '') {
            if (arg.isPositional) {
               positionals.push(val.trim());
            } else {
               flags.push(arg.name, val.trim());
            }
          } else if (arg.required) {
            setOutput(prev => prev + `\n> Error: ${arg.label} is required.\n`);
            return;
          }
        }
      }
      args = [...positionals, ...flags];
    }

    // Double check boolean required
    if (selectedCommand.argsSchema) {
       for (const arg of selectedCommand.argsSchema) {
           if (arg.required && arg.type === 'boolean' && !argValues[arg.name]) {
               setOutput(prev => prev + `\n> Error: You must check "${arg.label}" to proceed.\n`);
               return;
           }
       }
    }

    setIsRunning(true);
    setOutput(prev => prev + (prev ? '\n' : '') + `--- Starting new command ---\n`);
    
    try {
      const response = await fetch('/api/admin/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: selectedCommand.script,
          command: selectedCommand.command,
          args: args
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setOutput(prev => prev + `\n> HTTP Error: ${response.status} - ${errorData.error || response.statusText}\n`);
        setIsRunning(false);
        return;
      }

      if (!response.body) {
        setOutput(prev => prev + `\n> Error: No response body stream.\n`);
        setIsRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        setOutput(prev => prev + chunk);
      }
      
      const finalChunk = decoder.decode();
      if (finalChunk) setOutput(prev => prev + finalChunk);

    } catch (error: any) {
      setOutput(prev => prev + `\n> Exception: ${error.message}\n`);
    } finally {
      setIsRunning(false);
    }
  };

  const clearTerminal = () => setOutput('');

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] font-sans">
      <div className="flex flex-col gap-4 border-l-4 border-primary pl-6 py-1 mb-8 shrink-0">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground leading-none flex items-center gap-4">
          <TerminalIcon className="h-8 w-8 text-primary" /> System Terminal
        </h1>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] leading-none opacity-60">
          CLI Management & Script Execution
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0 overflow-hidden">
        {/* Controls Sidebar */}
        <div className="w-full lg:w-72 flex flex-col gap-6 overflow-y-auto pr-2 scrollbar-thin shrink-0">
          
          {/* Movies Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-border/50 pb-2">
              <Film className="w-4 h-4" /> Movies (mm.py)
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {COMMANDS.movies.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => handleSelectCommand(cmd)}
                  disabled={isRunning}
                  className={`flex items-center justify-start gap-3 w-full p-3 border rounded-xl text-sm font-bold transition-all text-left group
                    ${selectedCommand?.id === cmd.id 
                      ? 'bg-primary/10 border-primary text-primary shadow-sm' 
                      : 'bg-card border-border hover:border-primary/50 text-foreground disabled:opacity-50 disabled:cursor-not-allowed'}`}
                >
                  <div className={selectedCommand?.id === cmd.id ? 'text-primary' : 'text-muted-foreground group-hover:text-primary transition-colors'}>
                    {cmd.icon}
                  </div>
                  {cmd.description}
                </button>
              ))}
            </div>
          </div>

          {/* Series Section */}
          <div className="space-y-3 mt-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-blue-500 flex items-center gap-2 border-b border-border/50 pb-2">
              <Tv className="w-4 h-4" /> Series (series_cli.py)
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {COMMANDS.series.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => handleSelectCommand(cmd)}
                  disabled={isRunning}
                  className={`flex items-center justify-start gap-3 w-full p-3 border rounded-xl text-sm font-bold transition-all text-left group
                    ${selectedCommand?.id === cmd.id 
                      ? 'bg-blue-500/10 border-blue-500 text-blue-500 shadow-sm' 
                      : 'bg-card border-border hover:border-blue-500/50 text-foreground disabled:opacity-50 disabled:cursor-not-allowed'}`}
                >
                  <div className={selectedCommand?.id === cmd.id ? 'text-blue-500' : 'text-muted-foreground group-hover:text-blue-500 transition-colors'}>
                    {cmd.icon}
                  </div>
                  {cmd.description}
                </button>
              ))}
            </div>
          </div>

          {/* Utilities Section */}
          <div className="space-y-3 mt-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-purple-500 flex items-center gap-2 border-b border-border/50 pb-2">
              <Cpu className="w-4 h-4" /> Utilities
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {COMMANDS.utils.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => handleSelectCommand(cmd)}
                  disabled={isRunning}
                  className={`flex items-center justify-start gap-3 w-full p-3 border rounded-xl text-sm font-bold transition-all text-left group
                    ${selectedCommand?.id === cmd.id 
                      ? 'bg-purple-500/10 border-purple-500 text-purple-500 shadow-sm' 
                      : 'bg-card border-border hover:border-purple-500/50 text-foreground disabled:opacity-50 disabled:cursor-not-allowed'}`}
                >
                  <div className={selectedCommand?.id === cmd.id ? 'text-purple-500' : 'text-muted-foreground group-hover:text-purple-500 transition-colors'}>
                    {cmd.icon}
                  </div>
                  {cmd.description}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Main Content Area (Builder + Terminal) */}
        <div className="flex-1 flex flex-col gap-6 min-w-0 min-h-0">
          
          {/* Command Configurator */}
          {selectedCommand ? (
            <div className="bg-card border border-border rounded-2xl p-6 shrink-0 shadow-lg">
               <div className="flex items-center justify-between mb-4">
                 <div>
                   <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                      {selectedCommand.icon} {selectedCommand.description}
                   </h2>
                   <div className="text-xs font-mono text-muted-foreground mt-1 flex items-center gap-2">
                     <span className="px-1.5 py-0.5 bg-muted rounded">python3</span>
                     <span className="text-primary/80 ml-1">{selectedCommand.script}</span>
                     {selectedCommand.command && <span className="text-blue-400 ml-1">{selectedCommand.command}</span>}
                   </div>
                 </div>
                 <button
                    onClick={runCommand}
                    disabled={isRunning}
                    className="px-6 py-3 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs hover:bg-primary/90 transition-all rounded-xl shadow-xl shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isRunning ? 'Running...' : 'Execute'} <Play className="w-4 h-4" />
                 </button>
               </div>

               {selectedCommand.argsSchema && selectedCommand.argsSchema.length > 0 && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 p-4 bg-muted/30 rounded-xl border border-border/50">
                    {selectedCommand.argsSchema.map(arg => (
                      <div key={arg.name} className="flex flex-col gap-2">
                        {arg.type === 'string' ? (
                          <>
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                               {arg.label} {arg.required && <span className="text-destructive">*</span>}
                            </label>
                            <input
                              type="text"
                              value={(argValues[arg.name] as string) || ''}
                              onChange={e => handleArgChange(arg.name, e.target.value)}
                              placeholder={arg.placeholder}
                              disabled={isRunning}
                              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                            />
                          </>
                        ) : (
                          <label className="flex items-center gap-3 cursor-pointer group mt-4">
                            <div className="relative flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={(argValues[arg.name] as boolean) || false}
                                onChange={e => handleArgChange(arg.name, e.target.checked)}
                                disabled={isRunning}
                                className="sr-only"
                              />
                              <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                                argValues[arg.name] 
                                  ? 'bg-primary border-primary text-primary-foreground' 
                                  : 'bg-background border-border text-transparent group-hover:border-primary/50'
                              }`}>
                                <CheckSquare className={`w-4 h-4 ${argValues[arg.name] ? 'opacity-100' : 'opacity-0'}`} />
                              </div>
                            </div>
                            <span className="text-sm font-bold text-foreground select-none flex items-center gap-2">
                               {arg.label} {arg.required && <span className="text-destructive">*</span>}
                            </span>
                          </label>
                        )}
                      </div>
                    ))}
                 </div>
               )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6 shrink-0 shadow-lg flex items-center justify-center text-muted-foreground/50 italic text-sm">
               Select a command from the sidebar to configure and execute.
            </div>
          )}

          {/* Terminal Window */}
          <div className="flex-1 flex flex-col bg-[#0c0c0c] border border-border/50 rounded-2xl shadow-2xl overflow-hidden relative">
            <div className="h-10 bg-muted/20 border-b border-border/50 flex items-center justify-between px-4 shrink-0">
               <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-destructive/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
               </div>
               <div className="text-[10px] font-mono text-muted-foreground">
                  bash - admin@mirrormessiah
               </div>
               <button 
                  onClick={clearTerminal}
                  className="text-[10px] uppercase font-black tracking-widest text-muted-foreground hover:text-white transition-colors"
               >
                 Clear
               </button>
            </div>
            
            <div 
              ref={terminalRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm text-green-400/90 whitespace-pre-wrap scrollbar-thin selection:bg-green-500/30 selection:text-white"
            >
              {output || (
                <div className="opacity-50 flex flex-col gap-2 italic">
                  <span>Welcome to MirrorMessiah Terminal.</span>
                  <span>Select a command, configure its parameters, and click Execute.</span>
                  <span>Ready.</span>
                </div>
              )}
              {isRunning && (
                 <div className="mt-2 flex items-center gap-2 text-yellow-500 animate-pulse">
                    <div className="w-2 h-4 bg-yellow-500" /> Processing...
                 </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
