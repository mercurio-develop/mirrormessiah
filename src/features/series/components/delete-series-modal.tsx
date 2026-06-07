'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Trash2, HardDrive, Loader2 } from 'lucide-react';
import { deleteSeriesAction } from '../actions/delete-series';

interface DeleteSeriesModalProps {
  series: { id: number; title: string };
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteSeriesModal({ series, isOpen, onClose, onDeleted }: DeleteSeriesModalProps) {
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleteDirectory, setDeleteDirectory] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteSeriesAction([series.id], { deleteFiles, deleteDirectory });
      if (result.status === 'success') {
        onDeleted();
      } else {
        alert(result.message);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-destructive/30 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        <div className="p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-4">
                <div className="p-3 border border-destructive/50 text-destructive bg-destructive/10 rounded-xl shrink-0">
                    <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-black tracking-tight text-foreground">Confirm Deletion</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        You are about to permanently remove <span className="text-foreground font-bold">{series.title}</span> from the registry.
                    </p>
                </div>
            </div>

            <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border/50">
                <label className="flex items-start gap-4 cursor-pointer group">
                    <div className="mt-0.5 relative flex items-center justify-center">
                        <input
                            type="checkbox"
                            checked={deleteFiles}
                            onChange={(e) => setDeleteFiles(e.target.checked)}
                            className="peer sr-only"
                        />
                        <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${deleteFiles ? 'bg-destructive border-destructive text-white' : 'border-border group-hover:border-destructive/50 text-transparent'}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                            <HardDrive className="h-4 w-4 text-destructive/80" />
                            Delete Media Files
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Also remove the episodes from your hard drive.
                        </p>
                    </div>
                </label>

                <label className={`flex items-start gap-4 cursor-pointer group transition-all ${deleteFiles ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div className="mt-0.5 relative flex items-center justify-center">
                        <input
                            type="checkbox"
                            checked={deleteDirectory}
                            onChange={(e) => setDeleteDirectory(e.target.checked)}
                            disabled={!deleteFiles}
                            className="peer sr-only"
                        />
                        <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${deleteDirectory ? 'bg-destructive border-destructive text-white' : 'border-border group-hover:border-destructive/50 text-transparent'}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                            Delete Parent Directory
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Remove the entire series folder if it contains no other series files.
                        </p>
                    </div>
                </label>
            </div>
        </div>

        <div className="flex p-4 gap-3 bg-muted/20 border-t border-border/50">
            <button
                onClick={onClose}
                disabled={isPending}
                className="flex-1 h-12 bg-background border border-border text-sm font-bold text-foreground hover:bg-muted transition-all rounded-xl disabled:opacity-50"
            >
                Cancel
            </button>
            <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 h-12 bg-destructive text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-destructive/90 transition-all rounded-xl disabled:opacity-50 shadow-lg shadow-destructive/20"
            >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirm Purge
            </button>
        </div>

      </div>
    </div>
  );
}
