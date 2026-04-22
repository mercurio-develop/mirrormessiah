'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Subtitles, ScanSearch, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, Languages } from 'lucide-react';
import { scanMovieSubtitlesAction } from '../actions/scan-subtitles';
import { createMovieSubtitleAction } from '../actions/create-subtitle';
import { deleteMovieSubtitleAction } from '../actions/delete-subtitle';

interface Subtitle {
  id: number;
  path: string;
  lang: string | null;
  label: string | null;
  format: string;
  default_flag: number;
}

const LANG_OPTIONS = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Español' },
  { code: 'fre', label: 'Français' },
  { code: 'ger', label: 'Deutsch' },
  { code: 'por', label: 'Português' },
  { code: 'ita', label: 'Italiano' },
  { code: 'jpn', label: '日本語' },
];

export default function SubtitleManager({ movieId }: { movieId: number }) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [newPath, setNewPath] = useState('');
  const [newLang, setNewLang] = useState('eng');
  const [newLabel, setNewLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const fetchSubtitles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/movies/${movieId}/subtitles`);
      const data = await res.json();
      setSubtitles(data.subtitles ?? []);
    } finally {
      setLoading(false);
    }
  }, [movieId]);

  useEffect(() => { fetchSubtitles(); }, [fetchSubtitles]);

  const showStatus = (type: 'success' | 'error', msg: string) => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 4000);
  };

  const handleScan = async () => {
    startTransition(async () => {
        const result = await scanMovieSubtitlesAction(movieId);
        if (result.status === 'success') {
            showStatus('success', result.message || 'Scan complete');
            fetchSubtitles();
        } else {
            showStatus('error', result.message || 'Scan failed');
        }
    });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) return;
    
    startTransition(async () => {
        const langOption = LANG_OPTIONS.find(l => l.code === newLang);
        const result = await createMovieSubtitleAction(movieId, {
            path: newPath.trim(),
            lang: newLang || undefined,
            label: newLabel.trim() || langOption?.label || undefined,
        });

        if (result.status === 'success') {
            showStatus('success', 'Subtitle registered');
            setNewPath('');
            setNewLabel('');
            setNewLang('eng');
            setShowAdd(false);
            fetchSubtitles();
        } else {
            showStatus('error', result.message || 'Add failed');
        }
    });
  };

  const handleDelete = async (subtitleId: number) => {
    startTransition(async () => {
        const result = await deleteMovieSubtitleAction(movieId, subtitleId);
        if (result.status === 'success') {
            setSubtitles(prev => prev.filter(s => s.id !== subtitleId));
        } else {
            showStatus('error', result.message || 'Delete failed');
        }
    });
  };

  return (
    <div className="p-8 bg-card border border-border rounded-2xl space-y-6 shadow-sm">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Subtitles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Subtitles</h3>
          {subtitles.length > 0 && (
            <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-widest">
              {subtitles.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleScan}
            disabled={isPending}
            className="h-9 px-4  text-white text-xs font-bold rounded-xl flex items-center gap-2 hover:bg-zinc-700 disabled:opacity-50 transition-all"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            Scan Directory
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(v => !v)}
            className="h-9 px-4 bg-primary text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-2 hover:opacity-90 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Add Manual
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

      {showAdd && (
        <form onSubmit={handleAdd} className="p-5 bg-muted/20 border border-border rounded-xl space-y-4 animate-in slide-in-from-top-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Register Subtitle File</p>
          <div className="space-y-3">
            <input
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="/path/to/movie.en.srt"
              className="w-full h-11 bg-background border border-border rounded-xl px-4 text-sm font-mono text-foreground focus:border-primary outline-none transition-all"
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Language</label>
                <div className="relative">
                  <Languages className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                  <select
                    value={newLang}
                    onChange={e => {
                      setNewLang(e.target.value);
                      const opt = LANG_OPTIONS.find(l => l.code === e.target.value);
                      if (opt && !newLabel) setNewLabel(opt.label);
                    }}
                    className="w-full h-10 bg-background border border-border rounded-xl pl-9 pr-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all appearance-none"
                  >
                    <option value="">Unknown</option>
                    {LANG_OPTIONS.map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Label (display)</label>
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. English (SDH)"
                  className="w-full h-10 bg-background border border-border rounded-xl px-4 text-sm font-semibold text-foreground focus:border-primary outline-none transition-all"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="h-9 px-4 border border-border text-muted-foreground text-xs font-bold rounded-xl hover:bg-muted/20 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !newPath.trim()}
              className="h-9 px-4 bg-primary text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Register
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : subtitles.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <Subtitles className="h-8 w-8 text-muted-foreground/20 mx-auto" />
          <p className="text-xs font-bold text-muted-foreground/40 uppercase tracking-widest">No subtitles registered</p>
          <p className="text-[10px] text-muted-foreground/30">Use Scan Directory to auto-detect or Add Manual to register a file</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subtitles.map(sub => (
            <div
              key={sub.id}
              className="flex items-center gap-3 p-3 bg-muted/10 border border-border/50 rounded-xl group hover:border-border transition-all"
            >
              <div className="shrink-0 w-10 h-7 bg-primary/10 rounded-md flex items-center justify-center">
                <span className="text-[9px] font-black text-primary uppercase">{sub.format}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate font-mono">{sub.path.split('/').pop()}</p>
                <p className="text-[10px] text-muted-foreground/50 font-mono truncate">{sub.path}</p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {(sub.label || sub.lang) && (
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {sub.label || sub.lang}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(sub.id)}
                  className="h-7 w-7 flex items-center justify-center text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
