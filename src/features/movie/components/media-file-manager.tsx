'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import {
  Video,
  ScanSearch,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  Link as LinkIcon,
  X,
  FileVideo,
  HardDrive,
  Folder,
  Settings2,
  MoreVertical,
  ChevronDown
} from 'lucide-react';
import { FileBrowser } from '@/components/file-browser';
import { scanMovieFilesAction } from '../actions/scan-files';
import { relinkMovieAction } from '../actions/relink-movie';
import { deleteMovieFileAction } from '../actions/delete-file';

interface MediaFile {
  id: number;
  path: string;
  size_bytes: number | null;
  container: string | null;
  added_at: string;
}

export function MediaFileManager({ movieId }: { movieId: number }) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isDirBrowserOpen, setIsDirBrowserOpen] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [manualPath, setManualPath] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const showStatus = (type: 'success' | 'error', msg: string) => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 4000);
  };

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/movies/${movieId}/files`);
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch (err) {
      console.error('File fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [movieId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleManualRelink = async () => {
    if (!manualPath.trim()) return;
    startTransition(async () => {
        const result = await relinkMovieAction(movieId, { directoryPath: manualPath.trim() });
        if (result.status === 'success') {
            showStatus('success', 'Directory linked and scanned successfully');
            setShowManualInput(false);
            setManualPath('');
            fetchFiles();
        } else {
            showStatus('error', result.message || 'Manual link failed');
        }
    });
  };

  const handleScan = async () => {
    setShowActions(false);
    startTransition(async () => {
        const result = await scanMovieFilesAction(movieId);
        if (result.status === 'success') {
            const { added, removed, repaired } = result.payload || { added: 0, removed: 0, repaired: false };
            let msg = result.message || 'Scanning complete';
            if (repaired) msg = `Sector location repaired! ${added} files linked.`;
            else if (added > 0 || removed > 0) msg = `Sync complete: +${added} / -${removed} files.`;
            
            showStatus('success', msg);
            fetchFiles();
        } else {
            showStatus('error', result.message || 'Scan failed');
            if (result.message?.includes('location could not be determined')) setShowManualInput(true);
        }
    });
  };

  const handleRelink = async (filePath: string) => {
    setIsBrowserOpen(false);
    setIsDirBrowserOpen(false);
    startTransition(async () => {
        const result = await relinkMovieAction(movieId, { filePath });
        if (result.status === 'success') {
            showStatus('success', 'New media source synchronized');
            fetchFiles();
        } else {
            showStatus('error', result.message || 'Relink failed');
        }
    });
  };

  const handleDelete = async (fileId: number) => {
    if (files.length <= 1) {
      showStatus('error', 'Cannot remove last remaining media source');
      return;
    }
    if (!confirm('Are you sure you want to detach this file from the registry?')) return;

    startTransition(async () => {
        const result = await deleteMovieFileAction(movieId, fileId);
        if (result.status === 'success') {
            setFiles(prev => prev.filter(f => f.id !== fileId));
            showStatus('success', 'Media source detached from registry');
        } else {
            showStatus('error', result.message || 'Delete request failed');
        }
    });
  };

  return (
    <div className="p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm font-sans relative">
      {/* Unified Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl">
             <Video className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Media Sources</h3>
            <p className="text-xs text-muted-foreground font-medium">Linked storage entities for this registry entry</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Primary Action: Smart Sync */}
          <button
            type="button"
            onClick={handleScan}
            disabled={isPending}
            className="h-11 px-6 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl flex items-center gap-2 hover:opacity-90 transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            Smart Sync
          </button>
          
          {/* Secondary Actions: Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowActions(!showActions)}
              className={`h-11 px-4 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${showActions ? 'bg-muted ring-4 ring-primary/5' : ''}`}
            >
              <Settings2 className="h-4 w-4" />
              <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${showActions ? 'rotate-180' : ''}`} />
            </button>

            {showActions && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={() => { setShowActions(false); setIsBrowserOpen(true); }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted transition-colors text-left"
                >
                  <FileVideo className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">Relink Specific File</span>
                    <span className="text-[9px] text-muted-foreground uppercase">Pick a video from disk</span>
                  </div>
                </button>
                <button
                  onClick={() => { setShowActions(false); setIsDirBrowserOpen(true); }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted transition-colors text-left"
                >
                  <Folder className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">Link New Folder</span>
                    <span className="text-[9px] text-muted-foreground uppercase">Bulk scan whole directory</span>
                  </div>
                </button>
                <div className="h-px bg-border/50 mx-2 my-1" />
                <button
                  onClick={() => { setShowActions(false); setShowManualInput(true); }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted transition-colors text-left"
                >
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">Manual Path Override</span>
                    <span className="text-[9px] text-muted-foreground uppercase">Paste absolute server path</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {status && (
        <div className={`p-4 border text-xs font-bold flex items-center gap-3 rounded-2xl animate-in fade-in slide-in-from-top-2 ${
          status.type === 'success'
            ? 'bg-primary/10 border-primary/20 text-primary'
            : 'bg-destructive/10 border-destructive/20 text-destructive'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {status.msg}
        </div>
      )}

      {showManualInput && (
        <div className="p-6 bg-primary/5 border border-primary/20 rounded-2xl space-y-5 animate-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-primary">
              <HardDrive className="h-5 w-5" />
              <span className="text-sm font-black uppercase tracking-widest">Manual Directory Link</span>
            </div>
            <button onClick={() => setShowManualInput(false)} className="p-1.5 hover:bg-primary/10 rounded-full transition-colors text-primary/40 hover:text-primary">
                <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
             <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Automatic scan failed. Please verify the absolute path to the directory containing this movie's video files:
             </p>
             <div className="flex flex-col sm:flex-row gap-3">
                <input
                    type="text"
                    value={manualPath}
                    onChange={(e) => setManualPath(e.target.value)}
                    placeholder="/path/to/movie/folder"
                    className="flex-1 h-12 bg-background border border-border rounded-xl px-5 text-sm font-mono focus:border-primary outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                />
                <button
                    onClick={handleManualRelink}
                    className="h-12 px-8 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all shadow-xl shadow-primary/20"
                >
                    Link & Sync
                </button>
             </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-primary/20" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {files.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-border rounded-2xl">
               <FileVideo className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
               <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">No active media sources</p>
            </div>
          ) : (
            files.map((file, idx) => (
              <div
                key={file.id}
                className="group flex flex-col sm:flex-row sm:items-center gap-6 p-6 bg-muted/10 border border-border/40 rounded-2xl hover:bg-muted/30 hover:border-primary/20 transition-all duration-300"
              >
                <div className="shrink-0 w-16 h-16 bg-background border border-border rounded-xl flex items-center justify-center shadow-sm group-hover:border-primary/40 transition-all group-hover:shadow-primary/5">
                  <div className="flex flex-col items-center">
                    <Video className="h-6 w-6 text-primary/60 group-hover:text-primary transition-colors" />
                    <span className="text-[9px] font-black text-primary/40 uppercase mt-1">{(file.container || 'MP4')}</span>
                  </div>
                </div>
                
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3">
                     <p 
                        className="text-base font-bold text-foreground truncate cursor-help"
                        title={file.path.split('/').pop() || ''}
                     >
                        {file.path.split('/').pop()}
                     </p>
                     <div className="h-1.5 w-1.5 rounded-full bg-border" />
                     <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Source_0{idx + 1}</span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    <span 
                        className="text-[11px] font-mono text-muted-foreground/50 truncate max-w-lg block bg-background/50 px-2 py-0.5 rounded border border-border/30 cursor-help"
                        title={file.path.replace('/media/tushita/TUSHITA_W11_DATA/movies/', '')}
                    >
                        {file.path.replace('/media/tushita/TUSHITA_W11_DATA/movies/', '')}
                    </span>
                    {file.size_bytes && (
                      <span className="text-[10px] font-bold text-primary/60 flex items-center gap-1.5 bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                        <HardDrive className="h-3 w-3" /> {(file.size_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-muted-foreground/40 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> {new Date(file.added_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center justify-end pl-4">
                   <button
                    type="button"
                    onClick={() => handleDelete(file.id)}
                    title="Detach from registry"
                    className="h-12 w-12 flex items-center justify-center text-muted-foreground/20 hover:text-destructive hover:bg-destructive/10 transition-all rounded-2xl border border-border group-hover:border-destructive/20"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <FileBrowser
        movieId={movieId}
        isOpen={isBrowserOpen}
        mode="videos"
        onClose={() => setIsBrowserOpen(false)}
        onSelect={handleRelink}
      />

      <FileBrowser
        movieId={movieId}
        isOpen={isDirBrowserOpen}
        mode="videos"
        onClose={() => setIsDirBrowserOpen(false)}
        onSelect={handleRelink}
        onSelectDirectory={(dirPath) => {
            setIsDirBrowserOpen(false);
            setManualPath(dirPath);
            setShowManualInput(true);
        }}
      />
    </div>
  );
}

const Clock = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
);
