'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  Loader2,
  Folder,
  FolderOpen,
  FileVideo,
  FileText,
  Captions,
  File,
  ChevronRight,
  ChevronDown,
  HardDrive,
  Search,
  Copy,
  Check,
  AlertTriangle,
  Layers,
  ListTree,
} from 'lucide-react';
import type { CourseFileEntry, CourseFilesPayload, CourseFileKind } from '../queries/get-course-files';

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function kindIcon(kind: CourseFileKind) {
  switch (kind) {
    case 'folder':
      return Folder;
    case 'video':
      return FileVideo;
    case 'subtitle':
      return Captions;
    case 'document':
      return FileText;
    default:
      return File;
  }
}

function entryVisible(entry: CourseFileEntry, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  if (entry.kind === 'file') {
    return entry.name.toLowerCase().includes(q) || entry.path.toLowerCase().includes(q);
  }
  if (entry.name.toLowerCase().includes(q) || entry.path.toLowerCase().includes(q)) return true;
  return entry.children.some((child) => entryVisible(child, search));
}

function recountStats(entries: CourseFileEntry[]) {
  let videoCount = 0;
  let subtitleCount = 0;
  let otherCount = 0;
  let totalSizeBytes = 0;
  let missingOnDisk = 0;

  const walk = (items: CourseFileEntry[]) => {
    for (const item of items) {
      if (item.kind === 'file') {
        if (item.fileKind === 'video') videoCount += 1;
        else if (item.fileKind === 'subtitle') subtitleCount += 1;
        else otherCount += 1;
        totalSizeBytes += item.sizeBytes ?? 0;
        if (!item.exists) missingOnDisk += 1;
      } else {
        walk(item.children);
      }
    }
  };

  walk(entries);
  return { videoCount, subtitleCount, otherCount, totalSizeBytes, missingOnDisk };
}

function kindColor(kind: CourseFileKind): string {
  switch (kind) {
    case 'video':
      return 'text-primary';
    case 'subtitle':
      return 'text-sky-400';
    case 'document':
      return 'text-amber-500';
    case 'folder':
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground/70';
  }
}

function TreeNode({
  entry,
  depth,
  search,
  defaultOpen,
}: {
  entry: CourseFileEntry;
  depth: number;
  search: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (entry.kind === 'file') {
    if (!entryVisible(entry, search)) return null;
    const Icon = kindIcon(entry.fileKind);
    return (
      <div
        className={`flex items-start gap-3 py-2 px-3 rounded-xl hover:bg-muted/40 transition-colors ${!entry.exists ? 'opacity-60' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${kindColor(entry.fileKind)}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" title={entry.name}>{entry.name}</p>
          <p className="text-[10px] font-mono text-muted-foreground truncate" title={entry.path}>{entry.path}</p>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="text-[10px] font-bold text-muted-foreground">{formatBytes(entry.sizeBytes)}</span>
            {entry.indexed && entry.lessonNumber != null ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">
                L{String(entry.lessonNumber).padStart(2, '0')}
              </span>
            ) : null}
            {!entry.indexed ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Extra</span>
            ) : null}
            {!entry.exists ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Missing</span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!entryVisible(entry, search)) return null;

  const Icon = open ? FolderOpen : Folder;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-muted/40 transition-colors text-left"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <Icon className="h-4 w-4 shrink-0 text-amber-500/80" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{entry.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {entry.fileCount} files · {formatBytes(entry.totalSizeBytes)}
          </p>
        </div>
      </button>
      {open ? entry.children.map((child) => (
        <TreeNode key={child.path} entry={child} depth={depth + 1} search={search} defaultOpen={false} />
      )) : null}
    </div>
  );
}

function ModuleLessonView({ data, search }: { data: CourseFilesPayload; search: string }) {
  const q = search.trim().toLowerCase();

  return (
    <div className="space-y-4">
      {data.modules.map((mod) => {
        const lessons = mod.lessons.filter((lesson) => {
          if (!q) return true;
          const hay = `${mod.title ?? ''} ${lesson.title ?? ''} ${lesson.files.map((f) => f.path).join(' ')}`.toLowerCase();
          return hay.includes(q);
        });
        if (lessons.length === 0) return null;

        return (
          <div key={`${mod.moduleKind}-${mod.moduleNumber}`} className="border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/30 border-b border-border">
              <p className="text-sm font-bold">
                {mod.moduleKind.charAt(0).toUpperCase() + mod.moduleKind.slice(1)} {String(mod.moduleNumber).padStart(2, '0')}
                {mod.title ? ` — ${mod.title}` : ''}
              </p>
            </div>
            <div className="divide-y divide-border/50">
              {lessons.map((lesson) => (
                <div key={lesson.lessonId} className="px-4 py-3">
                  <p className="text-sm font-semibold mb-2">
                    L{String(lesson.lessonNumber).padStart(2, '0')}
                    {lesson.title ? ` — ${lesson.title}` : ''}
                  </p>
                  {lesson.files.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No files indexed</p>
                  ) : (
                    <div className="space-y-2">
                      {lesson.files.map((file) => {
                        const Icon = kindIcon(file.kind);
                        return (
                          <div key={file.path} className={`flex items-start gap-2 ${!file.exists ? 'opacity-60' : ''}`}>
                            <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${kindColor(file.kind)}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate" title={file.path.split('/').pop()}>{file.path.split('/').pop()}</p>
                              <p className="text-[10px] font-mono text-muted-foreground truncate" title={file.path}>{file.path}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CourseFileExplorer({
  courseId,
  courseTitle,
  isOpen,
  onClose,
}: {
  courseId: number;
  courseTitle: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<CourseFilesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'folder' | 'lessons'>('folder');
  const [copied, setCopied] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/files`);
      if (!res.ok) throw new Error('Failed to load course files');
      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load course files');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setView('folder');
      fetchFiles();
    }
  }, [isOpen, fetchFiles]);

  const searchTerm = useMemo(() => search.trim().toLowerCase(), [search]);

  const handleCopyRoot = async () => {
    if (!data?.courseRoot) return;
    await navigator.clipboard.writeText(data.courseRoot);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/95 backdrop-blur-xl">
      <div className="w-full max-w-5xl bg-card border border-border rounded-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-border bg-muted/20 space-y-4">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-amber-500" />
                Course Files
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{courseTitle}</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {data ? (
            <div className="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">{data.summary.videoCount} videos</span>
              <span className="px-2 py-1 rounded-full bg-sky-500/10 text-sky-400">{data.summary.subtitleCount} subtitles</span>
              {data.summary.otherCount > 0 ? (
                <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-500">{data.summary.otherCount} extras</span>
              ) : null}
              <span className="px-2 py-1 rounded-full bg-muted flex items-center gap-1">
                <HardDrive className="h-3 w-3" /> {formatBytes(data.summary.totalSizeBytes)}
              </span>
              {data.summary.missingOnDisk > 0 ? (
                <span className="px-2 py-1 rounded-full bg-destructive/10 text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {data.summary.missingOnDisk} missing
                </span>
              ) : null}
            </div>
          ) : null}

          {data?.courseRoot ? (
            <div className="flex items-center gap-2 p-3 bg-background/60 border border-border rounded-xl">
              <span className="text-xs font-mono text-muted-foreground truncate flex-1" title={data.courseRoot}>{data.courseRoot}</span>
              <button
                type="button"
                onClick={handleCopyRoot}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy path'}
              </button>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter files or folders..."
                className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-xl text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setView('folder')}
                className={`px-4 h-10 text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${view === 'folder' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
              >
                <ListTree className="h-3.5 w-3.5" /> Folders
              </button>
              <button
                type="button"
                onClick={() => setView('lessons')}
                className={`px-4 h-10 text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${view === 'lessons' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
              >
                <Layers className="h-3.5 w-3.5" /> Lessons
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Scanning course files...</span>
            </div>
          ) : error ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <p className="text-sm font-bold">{error}</p>
            </div>
          ) : !data ? null : data.tree.length === 0 && data.modules.every((m) => m.lessons.every((l) => l.files.length === 0)) ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Folder className="h-10 w-10 opacity-30" />
              <p className="text-sm font-bold">No files indexed for this course yet</p>
            </div>
          ) : view === 'lessons' ? (
            <ModuleLessonView data={data} search={searchTerm} />
          ) : (
            <div className="space-y-1">
              {data.tree.map((entry) => (
                <TreeNode
                  key={entry.kind === 'folder' ? entry.path : entry.path}
                  entry={entry}
                  depth={0}
                  search={searchTerm}
                  defaultOpen={entry.kind === 'folder' && entry.children.length <= 12}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
