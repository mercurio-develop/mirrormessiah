'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Loader2, Image as ImageIcon, Check, Video, Folder, ChevronRight, Home, ArrowLeft } from 'lucide-react';
import { b64urlEncode } from '@/lib/b64url';

interface Item {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  extension: string;
}

interface FileBrowserProps {
  movieId: number;
  isOpen: boolean;
  mode: 'images' | 'videos';
  onClose: () => void;
  onSelect: (filePath: string) => void;
  onSelectDirectory?: (dirPath: string) => void;
}

export default function FileBrowser({ movieId, isOpen, mode, onClose, onSelect, onSelectDirectory }: FileBrowserProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<any[]>([]);

  // Load initial movie directory or libraries
  useEffect(() => {
    if (isOpen && movieId) {
      loadInitialContext();
    }
  }, [isOpen, movieId, mode]);

  const loadInitialContext = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Try to get current movie directory
      const res = await fetch(`/api/browse/directory/${movieId}?type=${mode}`);
      const data = await res.json();
      
      if (res.ok && data.directory) {
        setCurrentPath(data.directory);
        fetchDirectory(data.directory);
      } else {
        // 2. Fallback: Load registered library roots
        const libRes = await fetch('/api/browse/libraries');
        const libData = await libRes.json();
        setLibraries(libData.libraries || []);
        setCurrentPath(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/browse/raw-directory?path=${encodeURIComponent(path)}&type=${mode}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setCurrentPath(data.currentPath);
      } else {
        throw new Error('Failed to scan sector');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item: Item) => {
    if (item.isDirectory) {
      fetchDirectory(item.path);
    } else {
      setSelectedPath(item.path);
    }
  };

  const handleGoBack = () => {
    if (!currentPath) return;
    const parent = currentPath.split(/[\\/]/).slice(0, -1).join('/');
    if (parent) fetchDirectory(parent);
    else loadInitialContext();
  };

  const handleConfirm = () => {
    if (selectedPath) {
      onSelect(selectedPath);
    }
  };

  const handleSelectCurrentDir = () => {
    if (currentPath && onSelectDirectory) {
      onSelectDirectory(currentPath);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="w-full max-w-5xl bg-card border border-border rounded-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-border bg-muted/30">
          <div className="flex justify-between items-start mb-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
                {mode === 'images' ? <ImageIcon className="h-5 w-5 text-primary" /> : <Video className="h-5 w-5 text-primary" />}
                Explorer: {mode === 'images' ? 'Poster Archive' : 'Media Storage'}
              </h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Navigating local sectors</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Breadcrumbs / Path Bar */}
          <div className="flex items-center gap-2 p-3 bg-background/50 border border-border rounded-xl">
             <button onClick={loadInitialContext} className="p-1 hover:text-primary transition-colors"><Home className="h-4 w-4" /></button>
             <ChevronRight className="h-3 w-3 opacity-20" />
             <span className="text-xs font-mono text-muted-foreground truncate flex-1">
                {currentPath || 'Library Root'}
             </span>
             {currentPath && (
               <button onClick={handleGoBack} className="flex items-center gap-2 px-3 py-1 bg-muted hover:bg-accent rounded-lg text-[10px] font-bold uppercase transition-all">
                  <ArrowLeft className="h-3 w-3" /> Back
               </button>
             )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Syncing sector data...</span>
            </div>
          ) : !currentPath && libraries.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               {libraries.map(lib => (
                 <button 
                  key={lib.id} 
                  onClick={() => fetchDirectory(lib.root_path)}
                  className="p-6 border border-border bg-muted/10 hover:border-primary/40 hover:bg-primary/5 rounded-2xl flex items-center gap-4 transition-all text-left"
                 >
                    <div className="p-3 bg-background rounded-xl shadow-sm"><Folder className="h-6 w-6 text-primary" /></div>
                    <div>
                        <p className="font-bold text-sm">{lib.name}</p>
                        <p className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">{lib.root_path}</p>
                    </div>
                 </button>
               ))}
            </div>
          ) : items.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground/40 gap-4">
               <Folder className="h-16 w-16" />
               <span className="text-xs font-bold uppercase tracking-widest text-center">Empty directory sector</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {items.map((item) => (
                <div 
                  key={item.path}
                  onClick={() => handleItemClick(item)}
                  onDoubleClick={() => item.isDirectory ? null : handleConfirm()}
                  className={`relative aspect-poster cursor-pointer transition-all duration-300 border rounded-2xl overflow-hidden group ${
                    selectedPath === item.path ? "border-primary ring-4 ring-primary/10 shadow-2xl scale-[1.02]" : "border-border hover:border-primary/40"
                  }`}
                >
                  {item.isDirectory ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center bg-muted/20">
                       <Folder className="h-12 w-12 text-primary/60 group-hover:scale-110 transition-transform" />
                       <p className="text-[10px] font-bold text-foreground leading-relaxed line-clamp-2">{item.name}</p>
                    </div>
                  ) : mode === 'images' ? (
                    <Image
                      src={"/api/images?path=" + b64urlEncode(item.path)}
                      alt={item.name}
                      fill
                      unoptimized
                      className={`object-cover transition-all duration-700 ${selectedPath === item.path ? "opacity-100" : "opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-80"}`}
                    />
                  ) : (
                    <div className={`w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center ${selectedPath === item.path ? "bg-primary/10" : "bg-muted/30"}`}>
                       <Video className={`h-10 w-10 ${selectedPath === item.path ? "text-primary" : "text-muted-foreground/20"}`} />
                       <p className="text-[10px] font-bold text-foreground leading-relaxed line-clamp-3">{item.name}</p>
                       <span className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">{(item.size / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
                    </div>
                  )}

                  <div className={`absolute inset-x-0 bottom-0 bg-background/90 backdrop-blur-sm p-3 border-t border-border transition-all duration-500 ${selectedPath === item.path || item.isDirectory ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"}`}>
                     <p className="text-[10px] font-bold text-foreground truncate">{item.name}</p>
                  </div>
                  
                  {selectedPath === item.path && !item.isDirectory && (
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
        <div className="p-6 border-t border-border flex justify-between items-center gap-6 bg-muted/30">
           <div className="flex-1 min-w-0">
                {currentPath && onSelectDirectory && (
                   <button 
                    onClick={handleSelectCurrentDir}
                    className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors text-[10px] font-black uppercase tracking-widest"
                   >
                     <Check className="h-3.5 w-3.5" /> Choose current folder
                   </button>
                )}
                {selectedPath && !loading && (
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] truncate mt-1">
                        Target: {selectedPath.split(/[\\/]/).pop()}
                    </p>
                )}
           </div>
           
           <div className="flex items-center gap-4">
                <button 
                onClick={onClose}
                className="text-xs font-bold text-muted-foreground hover:text-foreground transition-all uppercase tracking-widest"
                >
                Cancel
                </button>
                <button 
                onClick={handleConfirm}
                disabled={!selectedPath || loading}
                className="px-10 py-4 bg-primary text-primary-foreground text-xs font-extrabold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 disabled:grayscale disabled:scale-100 rounded-2xl"
                >
                Link File
                </button>
           </div>
        </div>
      </div>
    </div>
  );
}
