import path from 'path';
import { b64urlEncode } from '@/lib/b64url';

export interface SubtitleRow {
  path: string;
  lang: string | null;
  label: string | null;
  format: string | null;
}

export interface SubtitleTrackPayload {
  src: string;
  srclang: string;
  label: string;
  default?: boolean;
}

const LANG_MAP: Record<string, { code: string; label: string }> = {
  eng: { code: 'en', label: 'English' },
  en: { code: 'en', label: 'English' },
  spa: { code: 'es', label: 'Español' },
  es: { code: 'es', label: 'Español' },
  fre: { code: 'fr', label: 'Français' },
  fra: { code: 'fr', label: 'Français' },
  fr: { code: 'fr', label: 'Français' },
  ger: { code: 'de', label: 'Deutsch' },
  deu: { code: 'de', label: 'Deutsch' },
  de: { code: 'de', label: 'Deutsch' },
  por: { code: 'pt', label: 'Português' },
  pt: { code: 'pt', label: 'Português' },
  ita: { code: 'it', label: 'Italiano' },
  it: { code: 'it', label: 'Italiano' },
  jpn: { code: 'ja', label: '日本語' },
  ja: { code: 'ja', label: '日本語' },
  chi: { code: 'zh', label: 'Chinese' },
  zho: { code: 'zh', label: 'Chinese' },
  zh: { code: 'zh', label: 'Chinese' },
  rus: { code: 'ru', label: 'Русский' },
  ru: { code: 'ru', label: 'Русский' },
  ara: { code: 'ar', label: 'العربية' },
  ar: { code: 'ar', label: 'العربية' },
  glg: { code: 'gl', label: 'Galician' },
  gl: { code: 'gl', label: 'Galician' },
  baq: { code: 'eu', label: 'Basque' },
  eu: { code: 'eu', label: 'Basque' },
  cat: { code: 'ca', label: 'Catalan' },
  ca: { code: 'ca', label: 'Catalan' },
  hrv: { code: 'hr', label: 'Croatian' },
  hr: { code: 'hr', label: 'Croatian' },
  cze: { code: 'cs', label: 'Czech' },
  ces: { code: 'cs', label: 'Czech' },
  cs: { code: 'cs', label: 'Czech' },
  dan: { code: 'da', label: 'Danish' },
  da: { code: 'da', label: 'Danish' },
  dut: { code: 'nl', label: 'Dutch' },
  nld: { code: 'nl', label: 'Dutch' },
  nl: { code: 'nl', label: 'Dutch' },
  fin: { code: 'fi', label: 'Finnish' },
  fi: { code: 'fi', label: 'Finnish' },
  hun: { code: 'hu', label: 'Hungarian' },
  hu: { code: 'hu', label: 'Hungarian' },
  nor: { code: 'no', label: 'Norwegian' },
  nob: { code: 'no', label: 'Norwegian' },
  no: { code: 'no', label: 'Norwegian' },
  pol: { code: 'pl', label: 'Polish' },
  pl: { code: 'pl', label: 'Polish' },
  rum: { code: 'ro', label: 'Romanian' },
  ron: { code: 'ro', label: 'Romanian' },
  ro: { code: 'ro', label: 'Romanian' },
  swe: { code: 'sv', label: 'Swedish' },
  sv: { code: 'sv', label: 'Swedish' },
  tha: { code: 'th', label: 'Thai' },
  th: { code: 'th', label: 'Thai' },
  tur: { code: 'tr', label: 'Turkish' },
  tr: { code: 'tr', label: 'Turkish' },
  ukr: { code: 'uk', label: 'Ukrainian' },
  uk: { code: 'uk', label: 'Ukrainian' },
  vie: { code: 'vi', label: 'Vietnamese' },
  vi: { code: 'vi', label: 'Vietnamese' },
  ind: { code: 'id', label: 'Indonesian' },
  id: { code: 'id', label: 'Indonesian' },
  heb: { code: 'he', label: 'Hebrew' },
  he: { code: 'he', label: 'Hebrew' },
  kor: { code: 'ko', label: 'Korean' },
  ko: { code: 'ko', label: 'Korean' },
};

function labelFromPath(filePath: string, lang: string): string {
  const stem = path.basename(filePath, path.extname(filePath));
  const namePart = stem.includes('.') ? stem.split('.')[0] : stem;
  const cleaned = namePart
    .replace(/\[SDH\]/gi, ' SDH')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned) return cleaned;
  return LANG_MAP[lang]?.label || lang.toUpperCase();
}

function mapLang(lang: string | null | undefined): { code: string; label: string } {
  const key = (lang || 'en').toLowerCase();
  return LANG_MAP[key] ?? { code: key.slice(0, 2) || 'en', label: key.toUpperCase() };
}

/** Build Video.js subtitle tracks — one entry per file, no language dedup cap. */
export function buildSubtitleTracks(subtitles: SubtitleRow[]): SubtitleTrackPayload[] {
  const seenPaths = new Set<string>();
  const tracks: SubtitleTrackPayload[] = [];

  for (const s of subtitles) {
    if (seenPaths.has(s.path)) continue;
    seenPaths.add(s.path);

    const langKey = (s.lang || 'en').toLowerCase();
    const mapped = mapLang(langKey);
    const label = s.label?.trim() || labelFromPath(s.path, langKey);

    tracks.push({
      src: `/api/subtitle?path=${b64urlEncode(s.path)}`,
      srclang: mapped.code,
      label,
    });
  }

  const defaultIdx = tracks.findIndex((t) => t.srclang === 'en');
  const idx = defaultIdx >= 0 ? defaultIdx : 0;
  if (tracks[idx]) tracks[idx].default = true;

  return tracks;
}
