// Keep in sync with PLATFORM_PATTERNS in scripts/course_parse.py
export const COURSE_CATEGORIES = ['VFX & 3D', 'Development', 'General'] as const;

export const COURSE_PLATFORMS = [
  'Pikuma',
  'Udemy',
  'Rebelway',
  'Frontend Masters',
  'FXPHD',
  'CGBoost',
  'CGMA',
  'Gumroad',
  'Code With Mosh',
  'LinkedIn Learning',
  'Schoolism',
  'DeepLearning.AI',
  'Coursera',
  'TutsNode',
  'Redefinefx',
  'Double Jump Academy',
  'FreeCoursesOnline',
  'Ardan Labs',
] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];
export type CoursePlatform = (typeof COURSE_PLATFORMS)[number];
