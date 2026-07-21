import { getDb } from './db';
import path from 'path';

/**
 * Validate that a file path is within allowed library roots
 * Prevents directory traversal attacks
 */
export async function validateFilePath(filePath: string): Promise<boolean> {
  try {
    const db = getDb();
    
    // Get all library root paths
    const libraries = db.prepare('SELECT root_path FROM libraries').all() as Array<{ root_path: string }>;
    
    if (libraries.length === 0) {
      console.warn('No libraries found for path validation');
      return false;
    }
    
    // Resolve the absolute path to prevent traversal
    const resolvedPath = path.resolve(filePath);
    
    // Check if the resolved path starts with any library root
    for (const library of libraries) {
      const libraryRoot = path.resolve(library.root_path);
      if (resolvedPath.startsWith(libraryRoot)) {
        return true;
      }
    }
    
    console.warn(`Path validation failed: ${filePath} is not within any library root`);
    return false;
    
  } catch (error) {
    console.error('Error validating file path:', error);
    return false;
  }
}

/**
 * Get the MIME type based on file extension
 * For MKV files, use video/mp4 MIME type for better browser compatibility
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.mkv':
      // Using video/mp4 for MKV often allows browsers to play them if the codecs are compatible
      return 'video/mp4';
    case '.avi':
      return 'video/x-msvideo';
    case '.mov':
      return 'video/quicktime';
    case '.wmv':
      return 'video/x-ms-wmv';
    case '.flv':
      return 'video/x-flv';
    case '.webm':
      return 'video/webm';
    case '.m4v':
      return 'video/mp4'; // M4V is essentially MP4
    default:
      return 'application/octet-stream';
  }
}

/**
 * Get subtitle MIME type
 */
export function getSubtitleMimeType(format: string): string {
  switch (format.toLowerCase()) {
    case 'vtt':
      return 'text/vtt; charset=utf-8';
    case 'srt':
      return 'text/vtt; charset=utf-8'; // SRT will be converted to VTT
    default:
      return 'text/plain; charset=utf-8';
  }
}

/**
 * Convert SRT subtitle content to VTT format
 */
export function convertSrtToVtt(srtContent: string): string {
  // 1. Normalize line endings and strip BOM/whitespace
  let content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  
  // 2. SRT to VTT timestamp conversion (comma to dot)
  // Handles: 00:00:00,000 OR 0:00:00,000 OR 00:00:0,000
  content = content.replace(/(\d+:\d{2}:\d{2}),(\d{3})/g, (match, time, ms) => {
    return `${time}.${ms}`;
  });
  
  // 3. Ensure WEBVTT header followed by exactly two newlines
  return `WEBVTT\n\n${content}`;
}

/**
 * Parse HTTP Range header
 */
export function parseRangeHeader(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }
  
  const range = rangeHeader.substring(6); // Remove 'bytes='
  const parts = range.split('-');
  
  if (parts.length !== 2) {
    return null;
  }
  
  let start: number;
  let end: number;

  if (parts[0] === '') {
    // Suffix byte range: e.g., bytes=-500 (last 500 bytes)
    const suffixLength = parseInt(parts[1], 10);
    if (isNaN(suffixLength)) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = parseInt(parts[0], 10);
    if (parts[1] === '') {
      end = fileSize - 1;
    } else {
      end = parseInt(parts[1], 10);
    }
  }
  
  // Validate range
  if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
    return null;
  }
  
  return { start, end };
}

/**
 * Sanitize WebVTT content, ensuring correct header formatting and removing internal empty lines in cue payloads.
 */
/** Strip HTML tags and drop empty cues for reliable browser text-track playback. */
export function prepareVttForPlayback(vttContent: string): string {
  const lines = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];

  let i = 0;
  while (i < lines.length && !lines[i].includes('-->')) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('WEBVTT') || trimmed === '' || trimmed.startsWith('NOTE')) {
      out.push(lines[i]);
    }
    i++;
  }

  if (!out.some((line) => line.trim().startsWith('WEBVTT'))) {
    out.unshift('WEBVTT');
  }

  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;

    let identifier: string | undefined;
    if (!lines[i].includes('-->')) {
      identifier = lines[i];
      i++;
    }
    if (i >= lines.length || !lines[i].includes('-->')) break;

    const timestamp = lines[i].trim();
    i++;

    const payload: string[] = [];
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (trimmed === '' || trimmed.includes('-->')) break;
      const cleaned = lines[i].replace(/<[^>]+>/g, '').trim();
      if (cleaned) payload.push(cleaned);
      i++;
    }

    if (payload.length === 0) continue;

    out.push('');
    if (identifier) out.push(identifier);
    out.push(timestamp);
    out.push(...payload);
  }

  return out.join('\n').trim() + '\n';
}

export function sanitizeVtt(vttContent: string): string {
  // Normalize line endings
  const lines = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  
  // Find first timestamp to locate where header ends and cues begin
  let firstTimestampIndex = -1;
  for (let j = 0; j < lines.length; j++) {
    if (lines[j].includes('-->')) {
      firstTimestampIndex = j;
      break;
    }
  }

  const result: string[] = [];
  let headerEndIndex = 0;
  let hasHeader = false;

  if (firstTimestampIndex !== -1) {
    if (firstTimestampIndex > 0) {
      const lineBefore = lines[firstTimestampIndex - 1].trim();
      // If the line before the timestamp is not empty, and not WEBVTT, it's the first cue's identifier
      if (lineBefore !== '' && !lineBefore.startsWith('WEBVTT')) {
        headerEndIndex = firstTimestampIndex - 1;
      } else {
        headerEndIndex = firstTimestampIndex;
      }
    } else {
      headerEndIndex = 0;
    }

    // Process header lines (from 0 to headerEndIndex - 1)
    for (let j = 0; j < headerEndIndex; j++) {
      const line = lines[j];
      const trimmed = line.trim();
      if (trimmed.startsWith('WEBVTT')) {
        hasHeader = true;
      }
      result.push(line);
    }
  }

  // Prepend WEBVTT header if not present
  if (!hasHeader) {
    result.unshift('WEBVTT\n');
  }

  if (firstTimestampIndex !== -1) {
    // Process cues starting from headerEndIndex
    const cues: { identifier?: string; timestamp: string; payload: string[] }[] = [];
    let currentIdentifier: string | undefined = undefined;
    let i = headerEndIndex;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '') {
        i++;
        continue;
      }

      if (trimmed.includes('-->')) {
        const cue = {
          identifier: currentIdentifier,
          timestamp: trimmed,
          payload: [] as string[]
        };
        currentIdentifier = undefined; // consumed
        i++;

        // Read payload lines for the current cue
        while (i < lines.length) {
          const nextLine = lines[i];
          const nextTrimmed = nextLine.trim();

          if (nextTrimmed === '') {
            // We found a blank line. Let's check if it is a true cue separator.
            let lookAhead = i + 1;
            // Skip any consecutive blank lines
            while (lookAhead < lines.length && lines[lookAhead].trim() === '') {
              lookAhead++;
            }
            
            if (lookAhead >= lines.length) {
              // End of file, so this blank line is a separator
              i = lookAhead;
              break;
            }
            
            const firstNonBlank = lines[lookAhead].trim();
            if (firstNonBlank.includes('-->')) {
              // It's followed directly by a timestamp line. True separator!
              i = lookAhead;
              break;
            }
            
            // Check if it's followed by an identifier and then a timestamp line
            let nextNext = lookAhead + 1;
            if (nextNext < lines.length && lines[nextNext].trim().includes('-->')) {
              // Yes, firstNonBlank is the identifier, and nextNext is the timestamp. True separator!
              i = lookAhead; // We start parsing the next cue from the identifier line
              break;
            }
            
            // Otherwise, it's just a blank line inside the payload. We skip it and continue.
            i++;
            continue;
          }

          // If it's not a blank line, it's definitely part of the payload!
          cue.payload.push(nextLine);
          i++;
        }

        cues.push(cue);
      } else {
        currentIdentifier = trimmed;
        i++;
      }
    }

    // Append cues to result with exactly one blank line separator
    for (const cue of cues) {
      result.push('');
      if (cue.identifier) {
        result.push(cue.identifier);
      }
      result.push(cue.timestamp);
      result.push(...cue.payload);
    }
  }

  // Ensure file ends with a single newline
  return result.join('\n').trim() + '\n';
}