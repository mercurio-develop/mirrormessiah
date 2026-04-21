'use client';

import { useState, useEffect, useCallback } from 'react';
import { Video, ScanSearch, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, Search, Link as LinkIcon, X, FileVideo, HardDrive } from 'lucide-react';
import FileBrowser from './FileBrowser';

interface MediaFile {
  id: number;
  path: string;
  size_bytes: number | null;
  container: string | null;
  added_at: string;
}

export default function MediaFileManager({ movieId }: { movieId: number }) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isDirBrowserOpen, setIsDirBrowserOpen] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [manualPath, setManualPath] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

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
    try {
      const res = await fetch(`/api/movies/${movieId}/relink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directoryPath: manualPath.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        showStatus('error', data.error ?? 'Manual link failed');
        return;
      }
      showStatus('success', 'Directory linked and scanned successfully');
      setShowManualInput(false);
      setManualPath('');
      fetchFiles();
    } catch {
      showStatus('error', 'Manual link request failed');
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/movies/${movieId}/scan-files`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        showStatus('error', data.error ?? 'Scan failed');
        if (res.status === 404) setShowManualInput(true);
        return;
      }
      showStatus('success', `Scanning complete: ${data.added} new files linked`);
      fetchFiles();
    } catch {
      showStatus('error', 'Communication failure during scan');
    } finally {
      setScanning(false);
    }
  };

  const handleRelink = async (filePath: string) => {
    setIsBrowserOpen(false);
    try {
      const res = await fetch(`/api/movies/${movieId}/relink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      const data = await res.json();
      if (!res.ok) {
        showStatus('error', data.error ?? 'Relink failed');
        return;
      }
      showStatus('success', 'New media source synchronized');
      fetchFiles();
    } catch {
      showStatus('error', 'Relink request failed');
    }
  };

  const handleDelete = async (fileId: number) => {
    if (files.length <= 1) {
      showStatus('error', 'Cannot remove last remaining media source');
      return;
    }
    if (!confirm('Are you sure you want to detach this file from the registry?')) return;

    try {
      const res = await fetch(`/api/movies/${movieId}/files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) {
        showStatus('error', 'De-linking failed');
        return;
      }
      setFiles(prev => prev.filter(f => f.id !== fileId));
      showStatus('success', 'Media source detached from registry');
    } catch {
      showStatus('error', 'Delete request failed');
    }
  };

  return (
    <div className="p-8 bg-card border border-border rounded-2xl space-y-8 shadow-sm font-sans">
      {/* Enhanced Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl">
             <Video className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Media Sources</h3>
            <p className="text-xs text-muted-foreground font-medium">Manage video files linked to this entry</p>
          </div>
          {files.length > 0 && (
            <span className="ml-2 text-[10px] font-black bg-primary/10 text-primary px-2.5 py-1 rounded-full uppercase tracking-widest border border-primary/20">
              {files.length} {files.length === 1 ? 'FILE' : 'FILES'}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            title="Scan the current directory for any new video files"
            className="h-10 px-4 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            <span className="hidden sm:inline text-[10px] uppercase tracking-widest">Refresh</span>
          </button>
          
          <div className="h-6 w-px bg-border/50 mx-1 hidden md:block" />
          
          <button
            type="button"
            onClick={() => setIsBrowserOpen(true)}
            title="Choose a specific video file to link to this movie"
            className="h-10 px-4 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl flex items-center gap-2 transition-all"
          >
            <FileVideo className="h-4 w-4" />
            <span className="hidden sm:inline text-[10px] uppercase tracking-widest">Relink File</span>
          </button>
          
          <button
            type="button"
            onClick={() => setIsDirBrowserOpen(true)}
            title="Select an entire folder to scan and link all videos inside"
            className="h-10 px-5 bg-primary text-primary-foreground text-xs font-extrabold uppercase tracking-widest rounded-xl flex items-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/10"
          >
            <Folder className="h-4 w-4" />
            <span className="hidden sm:inline">Link Folder</span>
          </button>
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
            files.map(file => (
              <div
                key={file.id}
                className="group flex flex-col sm:flex-row sm:items-center gap-4 p-5 bg-muted/20 border border-border/40 rounded-2xl hover:bg-muted/40 hover:border-border transition-all duration-300"
              >
                <div className="shrink-0 w-14 h-14 bg-background border border-border rounded-xl flex items-center justify-center shadow-sm group-hover:border-primary/30 transition-colors">
                  <div className="flex flex-col items-center">
                    <Video className="h-5 w-5 text-primary/60 group-hover:text-primary transition-colors" />
                    <span className="text-[8px] font-black text-primary/40 uppercase mt-1">{(file.container || 'MP4')}</span>
                  </div>
                </div>
                
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-3">
                     <p className="text-sm font-bold text-foreground truncate">{file.path.split('/').pop()}</p>
                     <span className="px-2 py-0.5 bg-primary/5 text-primary text-[8px] font-black uppercase rounded-sm border border-primary/10">ID: {file.id}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 font-mono truncate max-w-2xl">{file.path}</p>
                  
                  <div className="flex items-center gap-4 pt-1">
                    {file.size_bytes && (
                      <span className="text-[10px] font-bold text-muted-foreground/60 flex items-center gap-1.5">
                        <HardDrive className="h-3 w-3" /> {(file.size_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-muted-foreground/30 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> Linked {new Date(file.added_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center justify-end">
                   <button
                    type="button"
                    onClick={() => handleDelete(file.id)}
                    title="Detach from registry"
                    className="h-10 w-10 flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all rounded-xl border border-transparent hover:border-destructive/20"
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
        onSelect={() => {}} 
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
