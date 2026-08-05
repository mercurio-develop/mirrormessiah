export const COURSE_HISTORY_KEY = 'mm_course_history';
export const COURSE_FAVORITES_KEY = 'mm_course_favorites';
export const COURSE_LIBRARY_EVENT = 'mm-course-library-changed';

export interface CourseHistoryEntry {
  courseId: number;
  lessonId: number;
  courseTitle: string;
  lessonTitle: string | null;
  moduleNumber: number;
  lessonNumber: number;
  thumbnail: string | null;
  watchedAt: number;
}

const MAX_HISTORY = 24;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(COURSE_LIBRARY_EVENT));
}

export function getCourseHistory(): CourseHistoryEntry[] {
  return readJson<CourseHistoryEntry[]>(COURSE_HISTORY_KEY, []);
}

export function recordCourseWatch(entry: Omit<CourseHistoryEntry, 'watchedAt'>) {
  const now = Date.now();
  const next = [
    { ...entry, watchedAt: now },
    ...getCourseHistory().filter((item) => item.courseId !== entry.courseId),
  ].slice(0, MAX_HISTORY);
  writeJson(COURSE_HISTORY_KEY, next);
}

export function getRecentCourses(limit = 8): CourseHistoryEntry[] {
  return getCourseHistory().slice(0, limit);
}

export function getCourseFavorites(): number[] {
  return readJson<number[]>(COURSE_FAVORITES_KEY, []);
}

export function isCourseFavorite(courseId: number): boolean {
  return getCourseFavorites().includes(courseId);
}

export function toggleCourseFavorite(courseId: number): boolean {
  const favorites = getCourseFavorites();
  const exists = favorites.includes(courseId);
  const next = exists ? favorites.filter((id) => id !== courseId) : [courseId, ...favorites];
  writeJson(COURSE_FAVORITES_KEY, next);
  return !exists;
}

export function getLessonProgressSeconds(lessonId: number): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(`mm_playback_time_lesson_${lessonId}`);
  if (!raw) return 0;
  const seconds = parseFloat(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function formatProgressLabel(seconds: number): string | null {
  if (seconds < 30) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hours}:${rem.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
