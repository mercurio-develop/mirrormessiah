'use client';

import { X, RefreshCw, AlertTriangle, Info, Loader2, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ValidateAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export default function ValidateAssetsModal({ isOpen, onClose, onConfirm, isLoading }: ValidateAssetsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-md bg-card border border-border rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-primary/5">
          <div className="flex items-center gap-3 text-primary">
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="text-sm font-black uppercase tracking-[0.2em]">Maintenance_Protocol</span>
          </div>
          <button onClick={onClose} disabled={isLoading} className="p-2 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div className="space-y-4">
             <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                <h3 className="text-xl font-bold text-foreground leading-tight mb-2">Sync Registry Artwork</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                   This process will surgically verify every movie poster path in your database against the physical files on your hard drive.
                </p>
             </div>

             <div className="flex items-start gap-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-xs font-black text-amber-500 uppercase tracking-widest">Database Operation</p>
                    <p className="text-[11px] text-muted-foreground font-medium leading-normal">
                        Dead links to non-existent folders will be cleared. This is essential after renaming movies on your drive to ensure the "Missing Artwork" filter is 100% accurate.
                    </p>
                </div>
             </div>
          </div>

          <div className="flex flex-col gap-3">
             <button
                onClick={onConfirm}
                disabled={isLoading}
                className="w-full h-12 bg-primary text-primary-foreground text-xs font-black uppercase tracking-[0.2em] rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
             >
                {isLoading ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validating_Assets...
                    </>
                ) : (
                    <>
                        <ShieldCheck className="h-4 w-4" />
                        Initiate Validation
                    </>
                )}
             </button>
             <button 
                onClick={onClose}
                disabled={isLoading}
                className="w-full h-10 text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors"
             >
                Abort Maintenance
             </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center gap-2">
            <Info className="h-3 w-3 text-muted-foreground/40" />
            <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-[0.2em]">Safety_Lock: Files on disk will NOT be modified.</span>
        </div>
      </motion.div>
    </div>
  );
}
