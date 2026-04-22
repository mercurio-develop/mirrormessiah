'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, Trash2, Shield, Loader2, AlertTriangle, HardDrive } from 'lucide-react';

interface DuplicateGroup {
  normalized_title: string;
  count: number;
  ids: string;
  titles: string;
  years: string;
  qualities: string;
  thumbnails: string;
}

interface MovieEntry {
  id: number;
  title: string;
  year: string;
  quality: string;
  thumbnail: string;
}

const getPosterUrl = (thumbnail: string): string => {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  return '/api/images?path=' + encodeURIComponent(thumbnail.replace(/\/+/g, '/'));
};

function parseGroup(group: DuplicateGroup): MovieEntry[] {
  const ids = group.ids.split(',');
  const titles = group.titles.split(',');
  const years = group.years.split(',');
  const qualities = group.qualities.split(',');
  const thumbnails = group.thumbnails.split(',');
  return ids.map((id, i) => ({
    id: parseInt(id),
    title: titles[i] || '',
    year: years[i] || '?',
    quality: qualities[i] || '?',
    thumbnail: thumbnails[i] || '',
  }));
}

interface ConfirmModalProps {
  count: number;
  deleteFiles: boolean;
  onDeleteFiles: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ count, deleteFiles, onDeleteFiles, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md border border-destructive/30  p-8 space-y-6 font-mono shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="p-3 border border-destructive/50 text-destructive shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-tighter text-white">Confirm_Purge</h2>
            <p className="text-[10px] text-white/60 uppercase tracking-widest leading-relaxed">
              You are about to permanently delete <span className="text-destructive font-black">{count} movie {count === 1 ? 'entry' : 'entries'}</span> from the registry.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-4 cursor-pointer group">
          <div
            onClick={() => onDeleteFiles(!deleteFiles)}
            className={"mt-0.5 h-4 w-4 border shrink-0 flex items-center justify-center transition-all " +
              (deleteFiles ? "bg-destructive border-destructive" : "border-white/20 group-hover:border-white/40")}
          >
            {deleteFiles && <span className="text-white text-[10px] font-black">✓</span>}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-white">
              <HardDrive className="h-3 w-3 text-destructive" />
              Also delete files from hard drive
            </div>
            <p className="text-[9px] text-white/30 uppercase tracking-widest leading-relaxed">
              Video and subtitle files will be permanently deleted from disk. This cannot be undone.
            </p>
          </div>
        </label>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 h-11 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:border-white/30 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-11 bg-destructive text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-destructive/80 transition-all"
          >
            <Trash2 className="h-3 w-3" />
            {deleteFiles ? 'Purge + Delete Files' : 'Purge Registry Only'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState<{ entries: number; files: number } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  useEffect(() => {
    fetch('/api/movies/duplicates')
      .then(r => r.json())
      .then(d => { setGroups(d.duplicates || []); setLoading(false); });
  }, []);

  const toggle = (id: number) => {
    setToDelete(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const autoSelect = () => {
    const next = new Set<number>();
    groups.forEach(group => {
      const entries = parseGroup(group);
      entries.slice(1).forEach(e => next.add(e.id));
    });
    setToDelete(next);
  };

  const handlePurge = async () => {
    setShowModal(false);
    setDeleting(true);

    const res = await fetch('/api/movies/duplicates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(toDelete), deleteFiles }),
    });

    if (res.ok) {
      const data = await res.json();
      setDone({ entries: data.deleted, files: data.filesDeleted });
      setGroups(prev =>
        prev.map(g => {
          const entries = parseGroup(g).filter(e => !toDelete.has(e.id));
          if (entries.length < 2) return null;
          return g;
        }).filter(Boolean) as DuplicateGroup[]
      );
      setToDelete(new Set());
      setDeleteFiles(false);
    }
    setDeleting(false);
  };

  return (
    <>
      {showModal && (
        <ConfirmModal
          count={toDelete.size}
          deleteFiles={deleteFiles}
          onDeleteFiles={setDeleteFiles}
          onConfirm={handlePurge}
          onCancel={() => setShowModal(false)}
        />
      )}

      <div className="flex flex-col gap-12 font-mono pb-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-l-4 border-destructive pl-6 py-2">
          <div className="space-y-2">
            <Link href="/admin" className="text-primary hover:text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-2 transition-colors">
              <ChevronLeft className="h-3 w-3" /> Back_to_Control
            </Link>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">Duplicate_Scanner</h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.4em]">
              {loading ? 'Scanning...' : groups.length === 0 ? 'Registry_Clean — No duplicates found' : groups.length + ' duplicate groups detected'}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={autoSelect}
              disabled={loading || groups.length === 0}
              className="h-12 px-6 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:border-white/30 transition-all disabled:opacity-20"
            >
              Auto-Select Dupes
            </button>
            <button
              onClick={() => setShowModal(true)}
              disabled={toDelete.size === 0 || deleting}
              className="h-12 px-8 bg-destructive text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-destructive/80 transition-all disabled:opacity-30"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Purge {toDelete.size > 0 ? toDelete.size + ' selected' : ''}
            </button>
          </div>
        </div>

        {done && (
          <div className="border border-primary/20 bg-primary/5 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-primary">
            ✓ Purged {done.entries} registry {done.entries === 1 ? 'entry' : 'entries'}
            {done.files > 0 && <span className="text-destructive/80 ml-4">+ {done.files} files deleted from disk</span>}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 py-24 justify-center">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Scanning registry for duplicates...</span>
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-24">
            <Shield className="h-12 w-12 text-primary/30" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Registry is clean</p>
          </div>
        )}

        <div className="space-y-6">
          {groups.map(group => {
            const entries = parseGroup(group);
            return (
              <div key={group.normalized_title} className="border border-white/5 /50 p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-3 w-3 text-destructive/60" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{group.count} copies</span>
                  <span className="text-[11px] font-black uppercase text-white">{entries[0]?.title}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {entries.map((entry, i) => {
                    const selected = toDelete.has(entry.id);
                    return (
                      <button
                        key={entry.id}
                        onClick={() => toggle(entry.id)}
                        className={"relative flex flex-col gap-2 text-left transition-all " + (selected ? "opacity-40" : "opacity-100")}
                      >
                        <div className={"relative aspect-[2/3] w-full overflow-hidden border-2 transition-all " + (selected ? "border-destructive" : "border-white/10 hover:border-white/30")}>
                          <Image src={getPosterUrl(entry.thumbnail)} alt={entry.title} fill className="object-cover" unoptimized />
                          {selected && (
                            <div className="absolute inset-0 bg-destructive/30 flex items-center justify-center">
                              <Trash2 className="h-6 w-6 text-destructive" />
                            </div>
                          )}
                          {i === 0 && !selected && (
                            <div className="absolute top-1 left-1 bg-primary/80 px-1.5 py-0.5 text-[7px] font-black uppercase">Keep</div>
                          )}
                        </div>
                        <div className="space-y-0.5 px-0.5">
                          <p className="text-[8px] font-black uppercase text-white/60 truncate">{entry.title}</p>
                          <p className="text-[8px] font-black uppercase text-white/40">{entry.year} · {entry.quality}</p>
                          <p className="text-[7px] font-mono text-white/20">ID: {entry.id}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
