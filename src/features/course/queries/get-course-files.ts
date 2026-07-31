import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov']);
const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa']);
const DOC_EXT = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.zip', '.rar', '.7z']);

export type CourseFileKind = 'folder' | 'video' | 'subtitle' | 'document' | 'other';

export interface CourseFileLeaf {
  kind: 'file';
  name: string;
  path: string;
  fileKind: Exclude<CourseFileKind, 'folder'>;
  sizeBytes: number | null;
  exists: boolean;
  indexed: boolean;
  lessonId: number | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  moduleNumber: number | null;
  moduleTitle: string | null;
}

export interface CourseFileFolder {
  kind: 'folder';
  name: string;
  path: string;
  children: CourseFileEntry[];
  fileCount: number;
  totalSizeBytes: number;
}

export type CourseFileEntry = CourseFileFolder | CourseFileLeaf;

export interface CourseFilesPayload {
  courseId: number;
  courseTitle: string;
  courseRoot: string | null;
  libraryRoot: string | null;
  summary: {
    videoCount: number;
    subtitleCount: number;
    otherCount: number;
    totalSizeBytes: number;
    missingOnDisk: number;
  };
  tree: CourseFileEntry[];
  modules: Array<{
    moduleNumber: number;
    moduleKind: string;
    title: string | null;
    lessons: Array<{
      lessonId: number;
      lessonNumber: number;
      title: string | null;
      files: Array<{ path: string; kind: CourseFileKind; sizeBytes: number | null; exists: boolean }>;
    }>;
  }>;
}

function fileKind(ext: string): Exclude<CourseFileKind, 'folder'> {
  if (VIDEO_EXT.has(ext)) return 'video';
  if (SUB_EXT.has(ext)) return 'subtitle';
  if (DOC_EXT.has(ext)) return 'document';
  return 'other';
}

function resolveCourseRoot(libraryRoot: string, filePath: string): string {
  const rel = path.relative(path.resolve(libraryRoot), path.resolve(filePath));
  const top = rel.split(path.sep)[0];
  return path.join(path.resolve(libraryRoot), top);
}

interface TreeBucket {
  folders: Map<string, TreeBucket>;
  files: CourseFileLeaf[];
}

function insertIntoTree(bucket: TreeBucket, segments: string[], leaf: CourseFileLeaf) {
  if (segments.length === 0) {
    bucket.files.push(leaf);
    return;
  }
  const [head, ...rest] = segments;
  if (!bucket.folders.has(head)) {
    bucket.folders.set(head, { folders: new Map(), files: [] });
  }
  insertIntoTree(bucket.folders.get(head)!, rest, leaf);
}

function bucketToEntries(bucket: TreeBucket, folderPath: string): CourseFileEntry[] {
  const entries: CourseFileEntry[] = [];

  for (const [name, child] of [...bucket.folders.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const childPath = path.join(folderPath, name);
    const children = bucketToEntries(child, childPath);
    const fileCount = countFiles(children);
    const totalSizeBytes = sumSize(children);
    entries.push({
      kind: 'folder',
      name,
      path: childPath,
      children,
      fileCount,
      totalSizeBytes,
    });
  }

  for (const file of [...bucket.files].sort((a, b) => a.name.localeCompare(b.name))) {
    entries.push(file);
  }

  return entries;
}

function countFiles(entries: CourseFileEntry[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.kind === 'file') return sum + 1;
    return sum + entry.fileCount;
  }, 0);
}

function sumSize(entries: CourseFileEntry[]): number {
  return entries.reduce((sum, entry) => {
    if (entry.kind === 'file') return sum + (entry.sizeBytes ?? 0);
    return sum + entry.totalSizeBytes;
  }, 0);
}

function scanExtraFiles(courseRoot: string, indexedPaths: Set<string>, bucket: TreeBucket) {
  if (!fs.existsSync(courseRoot)) return;

  const walk = (dir: string, relativeParts: string[]) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relParts = [...relativeParts, entry.name];

      if (entry.isDirectory()) {
        walk(fullPath, relParts);
        continue;
      }

      if (indexedPaths.has(fullPath)) continue;

      let sizeBytes: number | null = null;
      let exists = false;
      try {
        sizeBytes = fs.statSync(fullPath).size;
        exists = true;
      } catch {
        exists = false;
      }

      const ext = path.extname(entry.name).toLowerCase();
      insertIntoTree(bucket, relParts, {
        kind: 'file',
        name: entry.name,
        path: fullPath,
        fileKind: fileKind(ext),
        sizeBytes,
        exists,
        indexed: false,
        lessonId: null,
        lessonNumber: null,
        lessonTitle: null,
        moduleNumber: null,
        moduleTitle: null,
      });
    }
  };

  walk(courseRoot, []);
}

function recountStats(entries: CourseFileEntry[]): CourseFilesPayload['summary'] {
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

export function getCourseFiles(courseId: number, options: { includeUnindexed?: boolean } = {}): CourseFilesPayload | null {
  const db = getDb();
  const includeUnindexed = options.includeUnindexed ?? true;

  try {
    const course = db.prepare(`
      SELECT c.id, c.title, c.library_id, l.root_path AS library_root
      FROM courses c
      JOIN libraries l ON l.id = c.library_id
      WHERE c.id = ?
    `).get(courseId) as {
      id: number;
      title: string;
      library_id: number;
      library_root: string;
    } | undefined;

    if (!course) return null;

    const videos = db.prepare(`
      SELECT lf.path, lf.size_bytes, l.id AS lesson_id, l.lesson_number, l.title AS lesson_title,
             m.module_number, m.title AS module_title, m.module_kind
      FROM lesson_files lf
      JOIN lessons l ON lf.lesson_id = l.id
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ?
      ORDER BY m.module_number ASC, l.lesson_number ASC, lf.path ASC
    `).all(courseId) as Array<{
      path: string;
      size_bytes: number | null;
      lesson_id: number;
      lesson_number: number;
      lesson_title: string | null;
      module_number: number;
      module_title: string | null;
      module_kind: string;
    }>;

    const subtitles = db.prepare(`
      SELECT ls.path, ls.size_bytes, l.id AS lesson_id, l.lesson_number, l.title AS lesson_title,
             m.module_number, m.title AS module_title
      FROM lesson_subtitles ls
      JOIN lessons l ON ls.lesson_id = l.id
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ?
      ORDER BY ls.path ASC
    `).all(courseId) as Array<{
      path: string;
      size_bytes: number | null;
      lesson_id: number;
      lesson_number: number;
      lesson_title: string | null;
      module_number: number;
      module_title: string | null;
    }>;

    const allPaths = [...videos.map((v) => v.path), ...subtitles.map((s) => s.path)];
    const courseRoot = allPaths.length > 0
      ? resolveCourseRoot(course.library_root, allPaths[0])
      : null;

    const indexedPaths = new Set(allPaths);
    const bucket: TreeBucket = { folders: new Map(), files: [] };

    const addLeaf = (
      filePath: string,
      sizeBytes: number | null,
      meta: {
        lessonId: number;
        lessonNumber: number;
        lessonTitle: string | null;
        moduleNumber: number;
        moduleTitle: string | null;
      },
    ) => {
      const ext = path.extname(filePath).toLowerCase();
      const kind = fileKind(ext);
      let exists = false;
      let size = sizeBytes;

      try {
        const stats = fs.statSync(filePath);
        exists = true;
        size = stats.size;
      } catch {
        exists = false;
      }

      const rel = courseRoot ? path.relative(courseRoot, filePath) : filePath;
      const segments = rel.split(path.sep).filter(Boolean);
      const fileName = segments.pop() ?? path.basename(filePath);

      insertIntoTree(bucket, segments, {
        kind: 'file',
        name: fileName,
        path: filePath,
        fileKind: kind,
        sizeBytes: size,
        exists,
        indexed: true,
        lessonId: meta.lessonId,
        lessonNumber: meta.lessonNumber,
        lessonTitle: meta.lessonTitle,
        moduleNumber: meta.moduleNumber,
        moduleTitle: meta.moduleTitle,
      });
    };

    for (const row of videos) {
      addLeaf(row.path, row.size_bytes, {
        lessonId: row.lesson_id,
        lessonNumber: row.lesson_number,
        lessonTitle: row.lesson_title,
        moduleNumber: row.module_number,
        moduleTitle: row.module_title,
      });
    }

    for (const row of subtitles) {
      addLeaf(row.path, row.size_bytes, {
        lessonId: row.lesson_id,
        lessonNumber: row.lesson_number,
        lessonTitle: row.lesson_title,
        moduleNumber: row.module_number,
        moduleTitle: row.module_title,
      });
    }

    if (includeUnindexed && courseRoot && fs.existsSync(courseRoot)) {
      scanExtraFiles(courseRoot, indexedPaths, bucket);
    }

    const modulesRaw = db.prepare(`
      SELECT m.id, m.module_number, m.module_kind, m.title
      FROM course_modules m
      WHERE m.course_id = ?
      ORDER BY m.module_number ASC
    `).all(courseId) as Array<{ id: number; module_number: number; module_kind: string; title: string | null }>;

    const lessonsRaw = db.prepare(`
      SELECT l.id, l.module_id, l.lesson_number, l.title
      FROM lessons l
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ?
      ORDER BY m.module_number ASC, l.lesson_number ASC
    `).all(courseId) as Array<{ id: number; module_id: number; lesson_number: number; title: string | null }>;

    const lessonFiles = db.prepare(`
      SELECT lf.path, lf.size_bytes, lf.lesson_id
      FROM lesson_files lf
      JOIN lessons l ON lf.lesson_id = l.id
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ?
    `).all(courseId) as Array<{ path: string; size_bytes: number | null; lesson_id: number }>;

    const lessonSubs = db.prepare(`
      SELECT ls.path, ls.size_bytes, ls.lesson_id
      FROM lesson_subtitles ls
      JOIN lessons l ON ls.lesson_id = l.id
      JOIN course_modules m ON l.module_id = m.id
      WHERE m.course_id = ?
    `).all(courseId) as Array<{ path: string; size_bytes: number | null; lesson_id: number }>;

    const filesByLesson = new Map<number, Array<{ path: string; kind: CourseFileKind; sizeBytes: number | null; exists: boolean }>>();
    for (const row of [...lessonFiles, ...lessonSubs]) {
      const ext = path.extname(row.path).toLowerCase();
      const kind = fileKind(ext);
      let exists = false;
      try {
        fs.statSync(row.path);
        exists = true;
      } catch {
        exists = false;
      }
      const list = filesByLesson.get(row.lesson_id) ?? [];
      list.push({ path: row.path, kind, sizeBytes: row.size_bytes, exists });
      filesByLesson.set(row.lesson_id, list);
    }

    const lessonsByModule = lessonsRaw.reduce<Record<number, typeof lessonsRaw>>((acc, lesson) => {
      if (!acc[lesson.module_id]) acc[lesson.module_id] = [];
      acc[lesson.module_id].push(lesson);
      return acc;
    }, {});

    const modules = modulesRaw.map((mod) => ({
      moduleNumber: mod.module_number,
      moduleKind: mod.module_kind,
      title: mod.title,
      lessons: (lessonsByModule[mod.id] ?? []).map((lesson) => ({
        lessonId: lesson.id,
        lessonNumber: lesson.lesson_number,
        title: lesson.title,
        files: filesByLesson.get(lesson.id) ?? [],
      })),
    }));

    const tree = courseRoot ? bucketToEntries(bucket, courseRoot) : bucketToEntries(bucket, '');
    const summary = recountStats(tree);

    return {
      courseId,
      courseTitle: course.title,
      courseRoot,
      libraryRoot: course.library_root,
      summary,
      tree,
      modules,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('no such table')) return null;
    throw error;
  }
}

export function resolveCourseDirectory(courseId: number): string | null {
  const payload = getCourseFiles(courseId, { includeUnindexed: false });
  return payload?.courseRoot ?? null;
}
