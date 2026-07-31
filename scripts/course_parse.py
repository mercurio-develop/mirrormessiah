#!/usr/bin/env python3
"""Parse course folder structures into modules and lessons."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

VIDEO_EXT = {'.mp4', '.mkv', '.avi', '.webm', '.mov'}
SUB_EXT = {'.srt', '.vtt', '.ass', '.ssa'}

COURSE_CATEGORIES = ('VFX & 3D', 'Development', 'General')

SKIP_DIR_NAMES = {
    'assets', 'native', 'materials', 'videos', 'subtitles', 'scene files',
    'scenefiles', 'solaris_scenefiles', 'res', 'cg', 'week01', 'week02',
    'week03', 'week04', 'week05', 'week06', 'week07', 'week08',
    '.mm_cache', '.pad',
}

MODULE_PATTERNS = [
    (re.compile(r'^week\s*0*(\d+)\b', re.I), 'week'),
    (re.compile(r'^week(\d+)\b', re.I), 'week'),
    (re.compile(r'^chapter\s*0*(\d+)', re.I), 'chapter'),
    (re.compile(r'^section\s*0*(\d+)', re.I), 'section'),
    (re.compile(r'^(\d+)\.\s+', re.I), 'section'),
    (re.compile(r'^(\d+)\s*[-–—]\s*', re.I), 'section'),
    (re.compile(r'^p\s*0*(\d+)\b', re.I), 'section'),
    (re.compile(r'^part\s*0*(\d+)\b', re.I), 'section'),
]

# Order matters — first match wins.
PLATFORM_PATTERNS = [
    (re.compile(r'\bpikuma\b', re.I), 'Pikuma'),
    (re.compile(r'\bfrontend\s*masters?\b', re.I), 'Frontend Masters'),
    (re.compile(r'\budemy\b', re.I), 'Udemy'),
    (re.compile(r'\brebelway\b', re.I), 'Rebelway'),
    (re.compile(r'\bfxphd\b', re.I), 'FXPHD'),
    (re.compile(r'\bcgboost(?:\s*academy)?\b', re.I), 'CGBoost'),
    (re.compile(r'\bcgma\b', re.I), 'CGMA'),
    (re.compile(r'\bgumroad\b', re.I), 'Gumroad'),
    (re.compile(r'\bcode with mosh\b', re.I), 'Code With Mosh'),
    (re.compile(r'\bdeeplearning\s*ai\b', re.I), 'DeepLearning.AI'),
    (re.compile(r'\blinkedin\s*learning\b', re.I), 'LinkedIn Learning'),
    (re.compile(r'\bschoolism\b', re.I), 'Schoolism'),
    (re.compile(r'\bdeeplearning\.ai\b', re.I), 'DeepLearning.AI'),
    (re.compile(r'\bcoursera\b', re.I), 'Coursera'),
    (re.compile(r'\btutsnode\b', re.I), 'TutsNode'),
    (re.compile(r'\bredefinefx\b', re.I), 'Redefinefx'),
    (re.compile(r'\bdouble jump academy\b', re.I), 'Double Jump Academy'),
    (re.compile(r'\bfreecoursesonline\b', re.I), 'FreeCoursesOnline'),
]

PLATFORM_PREFIX_RE = re.compile(
    r'^(?:\d+\.\s*)?(?:\[[^\]]+\]\s*)?'
    r'(?:udemy|rebelway|frontend\s*masters?|fxphd|cgboost(?:\s*academy)?|gumroad|'
    r'code with mosh|coursera|pikuma|schoolism|linkedin learning|deeplearning\.ai|'
    r'double jump academy|cgma|freecoursesonline(?:\.me)?|tutsnode|redefinefx)\s*[-–—]\s*',
    re.I,
)

AUTHOR_PREFIX_RE = re.compile(
    r'^[A-Z][A-Za-z\-]+\s+[A-Z]\.\s+|'
    r'^[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z]\.\s+|'
    r'^[A-Z][a-z]+\s+[A-Z]\s+(?=[A-Z])',
)

LANG_TAG_RE = re.compile(r'\[([A-Z]{2,3}(?:[-/][A-Z]{2,3})*)\]', re.I)

COURSE_CODE_SUFFIX_RE = re.compile(
    r'\s*[-–—]\s*(?:NK\d+|NUKE\d+|HOU\d+|RND\d+|FX\d+).*$', re.I,
)

TECH_NOISE_RE = re.compile(
    r'\b(?:1080p|720p|2160p|4k|eng-rus|rus|mp4|mkv|x264|hevc)\b|\[[^\]]*\]',
    re.I,
)

PRESERVE_TOKENS = {
    'vex', 'houdini', 'nuke', 'typescript', 'javascript', 'python', 'golang', 'go',
    'rust', 'sql', 'blender', 'unreal', 'ue5', 'ue4', 'vfx', 'cg', '3d', '2d',
    'fx', 'llm', 'ai', 'api', 'gpu', 'cpu', 'substance', 'karma', 'solaris',
    'renderman', 'embergen', 'langchain', 'hda', 'usd', 'opengl', 'webgl',
    'css', 'html', 'node', 'react', 'nextjs', 'git', 'docker', 'kubernetes',
}

VFX_KEYWORDS = re.compile(
    r'\b(?:houdini|nuke|vfx|compositing|composit|karma|solaris|substance|renderman|'
    r'vex|fxphd|cgboost|rebelway|gumroad|blender|unreal|maya|zbrush|houdini|'
    r'lighting|shading|simulation|particles|crowds|lookdev|kitbash|embergen|'
    r'redshift|arnold|mantra|vray|octane|procedural|environments?)\b',
    re.I,
)

DEV_KEYWORDS = re.compile(
    r'\b(?:python|typescript|javascript|programming|bootcamp|golang|\bgo\b|rust|'
    r'data science|machine learning|sql|langchain|frontend|backend|developer|'
    r'coding|algorithm|react|node\.?js|next\.?js|cursor|claude|matt pocock|'
    r'code with mosh|coursera)\b',
    re.I,
)

DEV_PLATFORMS = frozenset({
    'Pikuma', 'Frontend Masters', 'Code With Mosh', 'Coursera', 'DeepLearning.AI',
    'FreeCoursesOnline', 'TutsNode',
})

VFX_PLATFORMS = frozenset({
    'Rebelway', 'FXPHD', 'CGBoost', 'CGMA', 'Gumroad', 'Redefinefx',
    'Double Jump Academy', 'Schoolism',
})

# Reject S1080E01-style resolution false positives (mirrors series_cli).
RESOLUTION_WIDTHS = frozenset({480, 576, 720, 1080, 1280, 1920, 2160, 3840})

LESSON_NUM_PATTERNS = [
    re.compile(r'^(\d{1,3})\s*[-–—_.]\s*', re.I),
    re.compile(r'^(\d{1,3})\s*\.\s*', re.I),
    re.compile(r'^(\d{1,3})[_\s]', re.I),
    re.compile(r'(?:^|[_\-\s])0*(\d{1,3})(?:[_\-\.\s]|$)', re.I),
    re.compile(r'week\d+[_\s]+0*(\d{1,3})', re.I),
    re.compile(r'ftg-(\d{1,3})', re.I),
    re.compile(r'(?:^|[_\-\s])0*(\d{1,3})$', re.I),
]


def _looks_like_resolution(num: int) -> bool:
    return num in RESOLUTION_WIDTHS


@dataclass
class ParsedModule:
    module_number: int
    module_kind: str
    module_title: str


@dataclass
class ParsedLesson:
    module_number: int
    module_kind: str
    module_title: str
    lesson_number: int
    lesson_title: str


@dataclass
class ParsedCourseMeta:
    title: str
    platform: str | None
    category: str
    language: str | None


def detect_platform(name: str) -> str | None:
    for pattern, label in PLATFORM_PATTERNS:
        if pattern.search(name):
            return label
    bracket = re.match(r'^\[([^\]]+)\]', name.strip())
    if bracket:
        inner = bracket.group(1)
        for pattern, label in PLATFORM_PATTERNS:
            if pattern.search(inner):
                return label
        if 'academy' in inner.lower() or 'boost' in inner.lower():
            return 'CGBoost'
    return None


def detect_category(name: str, platform: str | None, title: str | None = None) -> str:
    haystack = f'{name} {title or ""}'
    if platform in DEV_PLATFORMS:
        return 'Development'
    if platform in VFX_PLATFORMS:
        return 'VFX & 3D'
    if DEV_KEYWORDS.search(haystack):
        return 'Development'
    if VFX_KEYWORDS.search(haystack):
        return 'VFX & 3D'
    return 'General'


def extract_language_tags(name: str) -> str | None:
    tags = LANG_TAG_RE.findall(name)
    if not tags:
        return None
    return ', '.join(t.upper() for t in tags)


def _smart_token(word: str) -> str:
    bare = word.strip(".,;:")
    lower = bare.lower()
    if bare.isupper() and len(bare) > 2 and lower not in PRESERVE_TOKENS:
        bare = bare.capitalize()
        lower = bare.lower()
    if lower in PRESERVE_TOKENS:
        if lower in {'go', 'ai', 'cg', 'fx', '3d', '2d', 'sql', 'ue5', 'ue4', 'hda', 'usd', 'api', 'llm', 'gpu', 'cpu', 'vex'}:
            return lower.upper()
        if lower == 'typescript':
            return 'TypeScript'
        if lower == 'javascript':
            return 'JavaScript'
        if lower == 'langchain':
            return 'LangChain'
        if lower == 'nextjs':
            return 'Next.js'
        if lower == 'nodejs':
            return 'Node.js'
        return lower.capitalize() if lower == 'houdini' else lower.title()
    if lower in {'and', 'or', 'for', 'in', 'with', 'the', 'a', 'an', 'of', 'to', 'on', 'at', 'by'}:
        return lower
    return bare.capitalize() if bare.islower() else bare


def smart_title(name: str) -> str:
    words = re.split(r'(\s+)', name.strip())
    titled = ''.join(_smart_token(w) if w.strip() else w for w in words)
    if titled:
        parts = titled.split(None, 1)
        if parts:
            parts[0] = parts[0][:1].upper() + parts[0][1:]
            titled = ' '.join(parts) if len(parts) > 1 else parts[0]
    return titled.strip()


def clean_course_name(name: str) -> str:
    name = Path(name).name if '/' in name or '\\' in name else name
    platform = detect_platform(name)
    name = PLATFORM_PREFIX_RE.sub('', name.strip())
    if platform:
        for pattern, label in PLATFORM_PATTERNS:
            if label == platform:
                name = pattern.sub('', name, count=1)
        name = re.sub(r'^[-–—\s]+', '', name)
    name = AUTHOR_PREFIX_RE.sub('', name)
    name = COURSE_CODE_SUFFIX_RE.sub('', name)
    name = LANG_TAG_RE.sub(' ', name)
    name = TECH_NOISE_RE.sub(' ', name)
    name = re.sub(r'^\d+\.\s*', '', name)
    name = re.sub(r'[\[\]\(\)]', ' ', name)
    name = re.sub(r'\b(19|20)\d{2}\b', ' ', name)
    name = name.replace('_', ' ').replace('.', ' ')
    name = re.sub(r'\s+', ' ', name).strip(' -–—')
    name = re.sub(r'^Go Golang\b', 'Golang', name, flags=re.I)
    name = re.sub(r'\.\.\.+', ' ', name)
    return smart_title(name) if name else name


def parse_course_metadata(raw_folder_name: str) -> ParsedCourseMeta:
    platform = detect_platform(raw_folder_name)
    title = clean_course_name(raw_folder_name)
    category = detect_category(raw_folder_name, platform, title)
    language = extract_language_tags(raw_folder_name)
    return ParsedCourseMeta(title=title, platform=platform, category=category, language=language)


def format_course_folder_name(title: str, platform: str | None = None, category: str | None = None) -> str:
    """Standard on-disk folder name: 'Rebelway - Vex For Houdini Artists'."""
    safe_title = re.sub(r'[<>:"/\\|?*]', '_', title).strip()
    if platform:
        return f'{platform} - {safe_title}'
    return safe_title


def parse_module_folder(folder_name: str) -> ParsedModule | None:
    for pattern, kind in MODULE_PATTERNS:
        match = pattern.match(folder_name.strip())
        if match:
            num = int(match.group(1))
            title = pattern.sub('', folder_name).strip(' .-_–—')
            if not title:
                title = f'{kind.title()} {num}'
            return ParsedModule(num, kind, title)
    return None


def parse_lesson_filename(filename: str) -> tuple[int | None, str]:
    stem = Path(filename).stem
    for pattern in LESSON_NUM_PATTERNS:
        match = pattern.search(stem)
        if match:
            num = int(match.group(1))
            if _looks_like_resolution(num):
                continue
            title = pattern.sub('', stem, count=1).strip(' .-_–—')
            if not title:
                title = f'Lesson {num}'
            return num, smart_title(title.replace('_', ' '))
    cleaned = stem.replace('_', ' ').replace('.', ' ').strip()
    return None, smart_title(cleaned) if cleaned else stem


def should_skip_dir(name: str) -> bool:
    lower = name.lower().strip()
    if lower.startswith('.'):
        return True
    if lower in SKIP_DIR_NAMES:
        return True
    if lower.endswith('_subtitles') or lower.endswith('_data') or lower.endswith('_materials'):
        return True
    return False


def is_lesson_video(path: Path) -> bool:
    if path.suffix.lower() not in VIDEO_EXT:
        return False
    if '.mm_cache' in path.parts:
        return False
    lower = path.name.lower()
    if 'sample' in lower and path.stat().st_size < 50 * 1024 * 1024:
        return False
    return True


def resolve_lesson_path(course_root: Path, file_path: Path) -> ParsedLesson | None:
    if not is_lesson_video(file_path):
        return None

    rel_parts = file_path.relative_to(course_root).parts
    if not rel_parts:
        return None

    module: ParsedModule | None = None
    module_idx = -1
    for idx, part in enumerate(rel_parts[:-1]):
        parsed = parse_module_folder(part)
        if parsed:
            module = parsed
            module_idx = idx

    lesson_num, lesson_title = parse_lesson_filename(file_path.name)
    if lesson_num is None:
        lesson_num = 1

    if module is None:
        module = ParsedModule(1, 'module', 'Module 1')
    elif module_idx >= 0 and module_idx < len(rel_parts) - 2:
        deeper = parse_module_folder(rel_parts[-2]) if len(rel_parts) > 2 else None
        if deeper and deeper.module_kind in ('chapter', 'section'):
            module = deeper

    if not lesson_title or lesson_title.lower() == Path(file_path.stem).name.lower():
        lesson_title = smart_title(Path(file_path.stem).name.replace('_', ' ').replace('.', ' '))

    return ParsedLesson(
        module_number=module.module_number,
        module_kind=module.module_kind,
        module_title=module.module_title,
        lesson_number=lesson_num,
        lesson_title=lesson_title,
    )


def module_folder_name(kind: str, number: int, title: str | None = None) -> str:
    prefix = {'week': 'Week', 'chapter': 'Chapter', 'section': 'Section'}.get(kind, 'Module')
    base = f'{prefix} {number:02d}'
    if title and title.lower() not in {f'{kind} {number}', f'{prefix.lower()} {number}'}:
        clean = re.sub(r'[<>:"/\\|?*]', '_', title).strip()
        if clean and clean.lower() not in base.lower():
            return f'{base} - {clean}'
    return base


def lesson_file_name(lesson_number: int, title: str, ext: str) -> str:
    clean = re.sub(r'[<>:"/\\|?*]', '_', title).strip()
    if clean.lower().startswith('lesson '):
        return f'L{lesson_number:02d}{ext}'
    return f'L{lesson_number:02d} - {clean}{ext}'


def lesson_thumb_name(lesson_number: int, title: str) -> str:
    return lesson_file_name(lesson_number, title, '-thumb.jpg')


def detect_lang_from_path(path: Path) -> str:
    name = path.name.lower()
    lang_map = {
        'eng': 'en', 'spa': 'es', 'fre': 'fr', 'fra': 'fr', 'ger': 'de', 'deu': 'de',
        'por': 'pt', 'ita': 'it', 'jpn': 'ja', 'chi': 'zh', 'zho': 'zh', 'rus': 'ru',
    }
    parts = name.split('.')
    for part in parts:
        if part in lang_map:
            return lang_map[part]
        if len(part) == 2 and part.isalpha():
            return part
    if 'english' in name:
        return 'en'
    if 'spanish' in name:
        return 'es'
    if 'russian' in name:
        return 'ru'
    return 'en'


def index_subtitle_tree(course_root: Path) -> dict[tuple[int, int], list[Path]]:
    index: dict[tuple[int, int], list[Path]] = {}
    if not course_root.is_dir():
        return index
    sub_roots = [p for p in course_root.iterdir() if p.is_dir() and 'subtitle' in p.name.lower()]
    for sub_root in sub_roots:
        for sub_file in sub_root.rglob('*'):
            if sub_file.suffix.lower() not in SUB_EXT:
                continue
            rel = sub_file.relative_to(sub_root)
            module_num = 1
            if rel.parts:
                mod = parse_module_folder(rel.parts[0])
                if mod:
                    module_num = mod.module_number
            lesson_num, _ = parse_lesson_filename(sub_file.name)
            if lesson_num is None:
                continue
            index.setdefault((module_num, lesson_num), []).append(sub_file)
    for key in index:
        index[key].sort(key=lambda p: p.name)
    return index


def find_sidecar_subtitle(video_path: Path) -> Path | None:
    stem = video_path.stem
    for ext in SUB_EXT:
        candidate = video_path.with_name(stem + ext)
        if candidate.exists():
            return candidate
        for sub in video_path.parent.glob(f'{stem}.*{ext}'):
            if sub.exists():
                return sub
    return None
