'use client';

import { useState, useEffect, useTransition } from 'react';
import { X, Trash2, FolderOpen, Database, AlertTriangle, Loader2, Info } from 'lucide-react';
import { deleteMovieAction } from '../actions/delete-movie';

interface DeleteMovieModalProps {
  movie: { id: number, title: string };
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteMovieModal({ movie, isOpen, onClose, onDeleted }: DeleteMovieModalProps) {
  const [isPending, startTransition] = useTransition();
  const [conflictCheck, setConflictCheck] = useState<{ shared: boolean, count: number } | null>(null);
  const [checkLoading, setCheckCheckLoading] = useState(true);

  useEffect(() => {
    if (isOpen && movie.id) {
      const checkConflicts = async () => {
        setCheckCheckLoading(true);
        try {
          // We'll reuse the existing files list API to get paths, 
          // but for this UI we just need to know if any file in the DB 
          // belongs to another movie
          const res = await fetch(`/api/movies/${movie.id}/files`);
          const data = await res.json();
          const files = data.files || [];
          
          if (files.length > 0) {
            // Check if directory is shared
            // (Simplification: we'll assume for UI that if they have files, they might have conflicts)
            setConflictCheck({ shared: false, count: files.length });
          }
        } catch (e) {
          console.error('Conflict check failure:', e);
        } finally {
          setCheckCheckLoading(false);
        }
      };
      checkConflicts();
    }
  }, [isOpen, movie.id]);

  const handleDelete = async (mode: 'registry' | 'full') => {
    startTransition(async () => {
        const result = await deleteMovieAction(movie.id, { 
            deleteFiles: mode === 'full',
            deleteDirectory: mode === 'full' 
        });

        if (result.status === 'success') {
            onDeleted();
        } else {
            alert(result.message || 'Purge Protocol Failed');
        }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-background/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-8 border-b border-border flex justify-between items-center bg-destructive/5">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-foreground uppercase italic tracking-tight flex items-center gap-3">
              <Trash2 className="h-6 w-6 text-destructive" /> Purge Entity
            </h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Destructive Registry Protocol</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-all">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          <div className="space-y-3">
             <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest opacity-40">Target_Identity</p>
             <h3 className="text-xl font-bold text-foreground leading-tight">{movie.title}</h3>
          </div>

          <div className="space-y-4">
            {/* Option 1: Registry Only */}
            <button
              onClick={() => handleDelete('registry')}
              disabled={isPending}
              className="w-full p-6 border border-border bg-muted/20 hover:bg-muted/40 rounded-2xl flex items-center gap-5 transition-all text-left group"
            >
              <div className="p-3 bg-background border border-border rounded-xl group-hover:border-primary/40 transition-colors">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground text-sm">Delete from Registry Only</p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Files will remain on local storage</p>
              </div>
            </button>

            {/* Option 2: Full Purge */}
            <button
              onClick={() => handleDelete('full')}
              disabled={isPending}
              className="w-full p-6 border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 rounded-2xl flex items-center gap-5 transition-all text-left group"
            >
              <div className="p-3 bg-background border border-destructive/20 rounded-xl group-hover:border-destructive/50 transition-colors">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground text-sm">Full System Purge</p>
                <p className="text-[10px] font-bold text-destructive/60 uppercase tracking-widest mt-1 italic">Permanently delete movie and directory</p>
              </div>
            </button>
          </div>

          {/* Warnings */}
          <div className="p-5 bg-orange-500/5 border border-orange-500/20 rounded-2xl space-y-3">
             <div className="flex items-center gap-2 text-orange-500">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Confict Analysis</span>
             </div>
             {checkLoading ? (
               <div className="flex items-center gap-2 py-1">
                 <Loader2 className="h-3 w-3 animate-spin text-orange-500/50" />
                 <span className="text-[10px] font-bold text-muted-foreground uppercase animate-pulse">Scanning local sector...</span>
               </div>
             ) : (
               <p className="text-[11px] leading-relaxed text-muted-foreground uppercase font-medium">
                  {conflictCheck?.count ? (
                    `Detected ${conflictCheck.count} associated media files. Full purge will attempt to remove the entire directory if no other registry entities are linked.`
                  ) : (
                    "No media files detected for this entity. Registry entry will be removed."
                  )}
               </p>
             )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex justify-between items-center bg-muted/30">
           <div className="flex items-center gap-2 text-[9px] font-black text-muted-foreground/30 uppercase tracking-[0.3em]">
             <Info className="h-3 w-3" /> Irreversible Operation
           </div>
           <button 
             onClick={onClose}
             className="text-xs font-black text-muted-foreground hover:text-foreground transition-all uppercase tracking-widest"
           >
             Abort Protocol
           </button>
        </div>
      </div>
      
      {isPending && (
        <div className="absolute inset-0 z-[210] bg-background/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
           <Loader2 className="h-12 w-12 text-primary animate-spin" />
           <p className="text-[10px] font-black uppercase tracking-[0.5em] text-primary animate-pulse">Executing_Purge...</p>
        </div>
      )}
    </div>
  );
}
