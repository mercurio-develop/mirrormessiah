'use client';

import { useState, useEffect, useCallback } from 'react';
import { Video, ScanSearch, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, Search, Link as LinkIcon, X } from 'lucide-react';
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
        // If directory doesn't exist, show the manual input
        if (res.status === 404) {
          setShowManualInput(true);
        }
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
    <div className="p-8 bg-card border border-border rounded-2xl space-y-6 shadow-sm">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Video className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Media Sources</h3>
          {files.length > 0 && (
            <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-widest">
              {files.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="h-9 px-4 bg-zinc-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 hover:bg-zinc-700 disabled:opacity-50 transition-all"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            Refresh Folder
          </button>
          <button
            type="button"
            onClick={() => setIsBrowserOpen(true)}
            className="h-9 px-4 bg-primary text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-2 hover:opacity-90 transition-all"
          >
            <LinkIcon className="h-3.5 w-3.5" /> Relink File
          </button>
          <button
            type="button"
            onClick={() => setIsDirBrowserOpen(true)}
            className="h-9 px-4 bg-zinc-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 hover:bg-zinc-700 transition-all"
          >
            <Search className="h-3.5 w-3.5" /> Browse Folders
          </button>
        </div>
      </div>

      {status && (
        <div className={`p-3 border text-xs font-bold flex items-center gap-2 rounded-xl animate-in fade-in ${
          status.type === 'success'
            ? 'bg-primary/10 border-primary/20 text-primary'
            : 'bg-destructive/10 border-destructive/20 text-destructive'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {status.msg}
        </div>
      )}

      {showManualInput && (
        <div className="p-5 bg-primary/5 border border-primary/20 rounded-2xl space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <LinkIcon className="h-4 w-4" />
              <span className="text-xs font-black uppercase tracking-widest">Manual Directory Link</span>
            </div>
            <button onClick={() => setShowManualInput(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Automatic scan failed. Enter the absolute path to the directory where the movie is stored:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="/media/storage/movies/My Movie (2024)"
              className="flex-1 h-12 bg-background border border-border rounded-xl px-4 text-xs font-mono focus:border-primary outline-none"
            />
            <button
              onClick={handleManualRelink}
              className="h-12 px-6 bg-primary text-white text-xs font-bold uppercase rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20"
            >
              Update Registry
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-4 bg-muted/5 border border-border/50 rounded-xl group hover:border-border transition-all"
            >
              <div className="shrink-0 w-12 h-8 bg-primary/10 rounded-md flex items-center justify-center">
                <span className="text-[10px] font-black text-primary uppercase">{file.container || 'MP4'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{file.path.split('/').pop()}</p>
                <p className="text-[10px] text-muted-foreground/50 font-mono truncate">{file.path}</p>
              </div>
              <div className="shrink-0 flex items-center gap-4">
                {file.size_bytes && (
                  <span className="text-[10px] font-bold text-muted-foreground/40 font-mono">
                    {(file.size_bytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(file.id)}
                  className="h-8 w-8 flex items-center justify-center text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
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
        onSelect={() => {}} // Not used in this mode
        onSelectDirectory={(dirPath) => {
            setIsDirBrowserOpen(false);
            setManualPath(dirPath);
            setShowManualInput(true);
        }}
      />
    </div>
  );
}
