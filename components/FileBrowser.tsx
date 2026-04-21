'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Loader2, Image as ImageIcon, Check, Video } from 'lucide-react';
import { b64urlEncode } from '@/lib/b64url';

interface LibraryFile {
  name: string;
  path: string;
  size: number;
  extension: string;
}

interface FileBrowserProps {
  movieId: number;
  isOpen: boolean;
  mode: 'images' | 'videos';
  onClose: () => void;
  onSelect: (filePath: string) => void;
}

export default function FileBrowser({ movieId, isOpen, mode, onClose, onSelect }: FileBrowserProps) {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && movieId) {
      fetchFiles();
    }
  }, [isOpen, movieId, mode]);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/browse/directory/${movieId}?type=${mode}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      } else {
        throw new Error('Directory scan failed');
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="w-full max-w-4xl bg-card border border-border rounded-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
              {mode === 'images' ? <ImageIcon className="h-5 w-5 text-primary" /> : <Video className="h-5 w-5 text-primary" />}
              {mode === 'images' ? 'Poster Gallery' : 'Media Archive'}
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Browsing local directory sector</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Scanning assets...</span>
            </div>
          ) : error ? (
            <div className="h-64 flex flex-col items-center justify-center text-destructive gap-4 text-center">
               <span className="text-sm font-bold">{error}</span>
               <button onClick={fetchFiles} className="px-6 py-2 bg-destructive/10 rounded-full text-[10px] font-black uppercase hover:bg-destructive/20 transition-all">Retry Uplink</button>
            </div>
          ) : files.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground/40 gap-4">
               {mode === 'images' ? <ImageIcon className="h-16 w-16" /> : <Video className="h-16 w-16" />}
               <span className="text-xs font-bold uppercase tracking-widest text-center">No compatible files found in this directory</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {files.map((file) => (
                <div 
                  key={file.path}
                  onClick={() => setSelectedFile(file.path)}
                  className={`relative aspect-poster cursor-pointer transition-all duration-300 border rounded-2xl overflow-hidden group ${
                    selectedFile === file.path ? "border-primary ring-4 ring-primary/10 shadow-2xl scale-[1.02]" : "border-border hover:border-primary/40"
                  }`}
                >
                  {mode === 'images' ? (
                    <Image
                      src={"/api/images?path=" + b64urlEncode(file.path)}
                      alt={file.name}
                      fill
                      unoptimized
                      className={`object-cover transition-all duration-700 ${selectedFile === file.path ? "opacity-100" : "opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-80"}`}
                    />
                  ) : (
                    <div className={`w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center ${selectedFile === file.path ? "bg-primary/10" : "bg-muted/30"}`}>
                       <Video className={`h-10 w-10 ${selectedFile === file.path ? "text-primary" : "text-muted-foreground/20"}`} />
                       <p className="text-[10px] font-bold text-foreground leading-relaxed line-clamp-3">{file.name}</p>
                       <span className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">{(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
                    </div>
                  )}

                  <div className={`absolute inset-x-0 bottom-0 bg-background/90 backdrop-blur-sm p-3 border-t border-border transition-all duration-500 ${selectedFile === file.path ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"}`}>
                     <p className="text-[10px] font-bold text-foreground truncate">{file.name}</p>
                  </div>
                  
                  {selectedFile === file.path && (
                    <div className="absolute top-3 right-3 bg-primary p-1.5 shadow-2xl rounded-full">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-end items-center gap-6 bg-muted/30">
           <p className="flex-1 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] truncate">
             {selectedFile ? `Selected: ${Path.basename(selectedFile)}` : "Awaiting selection..."}
           </p>
           <button 
             onClick={onClose}
             className="text-xs font-bold text-muted-foreground hover:text-foreground transition-all uppercase tracking-widest"
           >
             Cancel
           </button>
           <button 
             onClick={handleConfirm}
             disabled={!selectedFile}
             className="px-10 py-4 bg-primary text-primary-foreground text-xs font-extrabold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 disabled:grayscale disabled:scale-100 rounded-2xl"
           >
             Select File
           </button>
        </div>
      </div>
    </div>
  );
}

const Path = {
    basename: (str: string) => {
        return str.split(/[\\/]/).pop() || '';
    }
};
