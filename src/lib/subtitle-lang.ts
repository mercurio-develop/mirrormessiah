import path from 'path';

const LANG3_MAP: Record<string, string> = {
  eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de',
  por: 'pt', ita: 'it', jpn: 'ja', chi: 'zh', zho: 'zh', rus: 'ru',
  ara: 'ar', ben: 'bn', hin: 'hi', urd: 'ur', kor: 'ko', vie: 'vi',
  tha: 'th', tur: 'tr', pol: 'pl', dut: 'nl', nld: 'nl', gre: 'el',
  ell: 'el', heb: 'he', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi',
  cat: 'ca', glg: 'gl', baq: 'eu', hrv: 'hr', cze: 'cs', ces: 'cs',
  rum: 'ro', ron: 'ro', hun: 'hu', ukr: 'uk', ind: 'id', msa: 'ms',
  may: 'ms', tel: 'te', tam: 'ta', kan: 'kn', mal: 'ml', fil: 'fil',
};

const LANG_LABELS: Record<string, string> = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português',
  it: 'Italiano', ja: '日本語', zh: 'Chinese', ru: 'Русский', ar: 'العربية',
  hi: 'Hindi', te: 'Telugu', ta: 'Tamil', kn: 'Kannada', ml: 'Malayalam',
  ko: 'Korean', vi: 'Vietnamese', th: 'Thai', tr: 'Turkish', pl: 'Polish',
  nl: 'Dutch', fi: 'Finnish', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
  ca: 'Catalan', gl: 'Galician', eu: 'Basque', hr: 'Croatian', cs: 'Czech',
  ro: 'Romanian', hu: 'Hungarian', uk: 'Ukrainian', id: 'Indonesian',
  he: 'Hebrew', bn: 'Bengali', ur: 'Urdu', fil: 'Filipino',
};

/** Detect ISO 639-1 language code from a subtitle file path or name. */
export function detectLangFromPath(filePath: string): string {
  const name = path.basename(filePath).toLowerCase();
  const parts = name.split('.');

  for (const part of parts) {
    if (LANG3_MAP[part]) return LANG3_MAP[part];
    if (part.length === 2 && /^[a-z]{2}$/.test(part)) {
      return part;
    }
  }

  if (name.includes('english') || name.includes('.eng.') || name.endsWith('.eng')) return 'en';
  if (name.includes('spanish') || name.includes('latin american')) return 'es';
  if (name.includes('french')) return 'fr';
  if (name.includes('german')) return 'de';
  if (name.includes('italian')) return 'it';
  if (name.includes('portuguese') || name.includes('brazilian')) return 'pt';
  if (name.includes('japanese')) return 'ja';
  if (name.includes('chinese')) return 'zh';
  if (name.includes('arabic')) return 'ar';
  if (name.includes('russian')) return 'ru';
  if (name.includes('hindi')) return 'hi';
  if (name.includes('telugu')) return 'te';
  if (name.includes('tamil')) return 'ta';
  if (name.includes('kannada')) return 'kn';
  if (name.includes('malayalam')) return 'ml';
  if (name.includes('korean')) return 'ko';
  if (name.includes('indonesian')) return 'id';
  if (name.includes('dansk') || name.includes('danish')) return 'da';

  return 'en';
}

/** Build a human-readable label for a subtitle track. */
export function labelFromSubtitlePath(filePath: string, lang?: string | null): string {
  const base = path.basename(filePath, path.extname(filePath));
  const code = (lang || detectLangFromPath(filePath)).toLowerCase();

  if (base.toLowerCase().includes('sdh')) {
    return `${LANG_LABELS[code] || code.toUpperCase()} (SDH)`;
  }
  if (base.toLowerCase().includes('forced')) {
    return `${LANG_LABELS[code] || code.toUpperCase()} (Forced)`;
  }

  // Extracted stream naming: Movie.0.eng or Movie.5.eng
  const streamMatch = base.match(/\.(\d+)\.([a-z]{2,3})$/i);
  if (streamMatch) {
    const streamLang = LANG3_MAP[streamMatch[2].toLowerCase()] || streamMatch[2].toLowerCase();
    const label = LANG_LABELS[streamLang] || streamLang.toUpperCase();
    return `${label} (Track ${streamMatch[1]})`;
  }

  // Language code suffix: Movie.en or Movie.eng
  const langSuffix = base.match(/\.([a-z]{2,3})$/i);
  if (langSuffix) {
    const suffix = langSuffix[1].toLowerCase();
    if (LANG3_MAP[suffix] || LANG_LABELS[suffix] || suffix.length === 2) {
      const resolved = LANG3_MAP[suffix] || suffix;
      return LANG_LABELS[resolved] || resolved.toUpperCase();
    }
  }

  // Descriptive names: "Latin American.spa", "English (SDH).eng.HI"
  const cleaned = base
    .replace(/\[SDH\]/gi, ' SDH')
    .replace(/_/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned && !/^\d+$/.test(cleaned) && cleaned.length > 2) {
    return cleaned;
  }

  return LANG_LABELS[code] || code.toUpperCase();
}

export const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa'];
