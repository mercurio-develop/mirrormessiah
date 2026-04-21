'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Loader2, Image as ImageIcon, Check } from 'lucide-react';

interface PosterFile {
  name: string;
  path: string;
  size: number;
  extension: string;
}

interface FileBrowserProps {
  movieId: number;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (filePath: string) => void;
}

export default function FileBrowser({ movieId, isOpen, onClose, onSelect }: FileBrowserProps) {
  const [files, setFiles] = useState<PosterFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && movieId) {
      fetchFiles();
    }
  }, [isOpen, movieId]);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/browse/movie-posters/" + movieId);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      } else {
        throw new Error('Signal lost during directory scan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (selectedFile) {
      onSelect(selectedFile);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="terminal-border w-full max-w-4xl bg-card rounded-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-accent/5">
          <div className="space-y-1">
            <h2 className="text-xl font-black uppercase italic tracking-tighter text-foreground">Ocular_Registry_Browser</h2>
            <p className="text-[10px] font-black text-primary/60 uppercase tracking-[0.4em]">Scanning_Sector_0x{movieId.toString(16).toUpperCase()}_Dir</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-accent/10 rounded-md transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary animate-pulse">Index_Reconstruction_In_Progress...</span>
            </div>
          ) : error ? (
            <div className="h-64 flex flex-col items-center justify-center text-destructive gap-4">
               <span className="text-xs font-black uppercase tracking-widest">{error}</span>
               <button onClick={fetchFiles} className="text-[10px] underline uppercase hover:text-destructive/80 transition-colors">Retry_Uplink</button>
            </div>
          ) : files.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground/40 gap-4">
               <ImageIcon className="h-12 w-12" />
               <span className="text-[10px] font-black uppercase tracking-widest text-center">No_Visual_Assets_Detected_In_Sector_Directory</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {files.map((file) => (
                <div 
                  key={file.path}
                  onClick={() => setSelectedFile(file.path)}
                  className={"relative aspect-poster cursor-pointer transition-all duration-500 border rounded-md overflow-hidden group " + 
                    (selectedFile === file.path ? "border-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]" : "border-border hover:border-primary/50")}
                >
                  <Image
                    src={"/api/images?path=" + encodeURIComponent(file.path) + "&public=true"}
                    alt={file.name}
                    fill
                    className={"object-cover transition-all duration-700 " + (selectedFile === file.path ? "opacity-100 scale-105" : "opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-80")}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-background/90 backdrop-blur-sm p-2 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
                     <p className="text-[10px] font-black uppercase tracking-tighter text-foreground truncate">{file.name}</p>
                  </div>
                  {selectedFile === file.path && (
                    <div className="absolute top-2 right-2 bg-primary p-1 shadow-2xl rounded-sm">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end items-center gap-4 bg-accent/5">
           <p className="flex-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest italic">
             {selectedFile ? "Archive_Target_Selected: " + Path.basename(selectedFile) : "Awaiting_Input_Signal..."}
           </p>
           <button 
             onClick={onClose}
             className="px-6 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all"
           >
             Cancel
           </button>
           <button 
             onClick={handleConfirm}
             disabled={!selectedFile}
             className="px-8 py-3 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_15px_hsl(var(--primary)/0.2)] disabled:opacity-50 rounded-md"
           >
             Commit_to_Registry
           </button>
        </div>
      </div>
    </div>
  );
}

// Simple path helper for client component
const Path = {
    basename: (str: string) => {
        return str.split(/[\\/]/).pop() || '';
    }
};
