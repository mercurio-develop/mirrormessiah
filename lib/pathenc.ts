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
 * More robust conversion that handles line endings and timestamp formatting correctly
 */
export function convertSrtToVtt(srtContent: string): string {
  // Normalize line endings
  let content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Replace comma with dot in timestamps (SRT uses 00:00:00,000 -> VTT uses 00:00:00.000)
  content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  
  // Ensure the header is present and followed by an empty line
  return 'WEBVTT\n\n' + content.trim();
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
  
  const start = parts[0] ? parseInt(parts[0], 10) : 0;
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  
  // Validate range
  if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
    return null;
  }
  
  return { start, end };
}