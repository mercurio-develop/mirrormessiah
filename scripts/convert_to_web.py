#!/usr/bin/env python3
"""
convert_to_web.py - Converts media files to a web-compatible MP4 format.

This script uses `ffmpeg` to analyze video files and re-encode them to 
H.264 (video) and AAC (audio) if they are not already in those formats.
Crucially, it also applies `-movflags +faststart` to move the moov atom 
to the beginning of the file, allowing immediate streaming in browsers.

Usage:
  python3 scripts/convert_to_web.py /path/to/media/file.mkv
  python3 scripts/convert_to_web.py /path/to/series/folder

Dependencies:
  - ffmpeg
  - ffprobe
"""

import argparse
import subprocess
import sys
import json
import os
from pathlib import Path

VIDEO_EXTS = {'.mp4', '.mkv', '.avi', '.webm', '.mov'}

def get_streams(file_path: Path):
    """Retrieve video and audio streams using ffprobe."""
    cmd = [
        'ffprobe', '-v', 'quiet', '-print_format', 'json', 
        '-show_streams', str(file_path)
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return json.loads(result.stdout).get('streams', [])
    except Exception as e:
        print(f"  [!] Error reading streams from {file_path.name}: {e}")
        return []

def extract_subtitles(file_path: Path, streams):
    s_streams = [s for s in streams if s.get('codec_type') == 'subtitle']
    if not s_streams:
        return

    print(f"  [*] Found {len(s_streams)} subtitle stream(s). Extracting to .vtt...")
    
    for s in s_streams:
        codec_name = s.get('codec_name', '')
        # Only extract text-based subtitles
        if codec_name not in ('subrip', 'ass', 'ssa', 'mov_text', 'webvtt', 'srt'):
            print(f"  [!] Skipping subtitle index {s['index']} - unsupported codec for text extraction: {codec_name}")
            continue

        tags = s.get('tags', {})
        lang = tags.get('language', 'eng') # Default to eng if unknown
        
        # Naming format: movie.0.eng.vtt
        # This matches the Next.js detection logic: parts[parts.length - 2] == 'eng'
        out_sub_path = file_path.parent / f"{file_path.stem}.{s['index']}.{lang}.vtt"
        
        if out_sub_path.exists():
            print(f"  [+] Subtitle {out_sub_path.name} already exists. Skipping.")
            continue
            
        cmd = [
            'ffmpeg', '-y', '-i', str(file_path),
            '-map', f"0:{s['index']}",
            '-c:s', 'webvtt',
            str(out_sub_path)
        ]
        
        try:
            subprocess.run(cmd, capture_output=True, check=True)
            print(f"  [✓] Extracted subtitle: {out_sub_path.name}")
        except subprocess.CalledProcessError as e:
            err_msg = e.stderr.decode('utf-8', errors='ignore') if e.stderr else str(e)
            last_line = err_msg.strip().splitlines()[-1] if err_msg else 'Unknown error'
            print(f"  [!] Failed to extract subtitle index {s['index']}: {last_line}")

def convert_file(file_path: Path):
    print(f"\nProcessing: {file_path.name}")
    streams = get_streams(file_path)
    
    if not streams:
        print("  [!] Could not read streams. Skipping.")
        return

    # Extract subtitles before converting video
    extract_subtitles(file_path, streams)

    v_codec = next((s.get('codec_name') for s in streams if s.get('codec_type') == 'video'), None)
    a_codecs = [s.get('codec_name') for s in streams if s.get('codec_type') == 'audio']
    pix_fmt = next((s.get('pix_fmt') for s in streams if s.get('codec_type') == 'video'), '') or ''

    print(f"  Detected - Video: {v_codec} ({pix_fmt}), Audio: {', '.join(a_codecs) if a_codecs else 'None'}")

    # Determine conversion strategy
    # Re-encode if it's not H.264, OR if it's 10-bit/12-bit H.264 (browsers don't support 10-bit H.264 well)
    needs_video_encode = v_codec != 'h264' or '10' in pix_fmt or '12' in pix_fmt

    if not needs_video_encode:
        v_cmd = ['-c:v', 'copy']
        print("  [+] Video is H.264 (8-bit). Copying stream (fast).")
    else:
        # Force 8-bit yuv420p for maximum web compatibility
        v_cmd = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p']
        print(f"  [*] Video is {v_codec} ({pix_fmt}). Re-encoding to H.264 (8-bit)...")

    # If the audio is already AAC (or MP3, which is also web compatible), we copy it.
    needs_audio_encode = any(c not in ('aac', 'mp3') for c in a_codecs) if a_codecs else False

    if not needs_audio_encode and a_codecs:
        a_cmd = ['-c:a', 'copy']
        print(f"  [+] All audio streams are web-compatible. Copying streams.")
    else:
        a_cmd = ['-c:a', 'aac', '-b:a', '192k']
        print(f"  [*] Re-encoding audio to AAC...")

    import shutil
    import tempfile
    
    # We use a temporary file in the SAME directory as the source file.
    # This ensures we use the disk space of the media drive (e.g. external HDD)
    # rather than the system /tmp directory which might be on a small/full SSD.
    fd, temp_out_str = tempfile.mkstemp(
        suffix='.web.mp4', 
        prefix='.mm_tmp_', 
        dir=str(file_path.parent)
    )
    os.close(fd)
    temp_out = Path(temp_out_str)

    # Build the ffmpeg command
    cmd = [
        'ffmpeg', '-y', '-i', str(file_path),
        '-map', '0:v:0', # Map only the first video stream (ignores embedded cover art/images)
        '-map', '0:a?',  # Map all audio streams
        *v_cmd,
        *a_cmd,
        # Ensure the moov atom is moved to the start of the file for web streaming
        '-movflags', '+faststart',
        str(temp_out)
    ]
    
    print(f"  Running: {' '.join(cmd)}")
    
    try:
        # Run ffmpeg
        subprocess.run(cmd, check=True)
        print(f"  [✓] Conversion successful!")
        
        # Rename original to .bak so we don't lose it if something goes wrong
        backup = file_path.with_name(file_path.name + '.bak')
        if file_path.exists():
            file_path.rename(backup)
            print(f"  [i] Original backed up as {backup.name}")
        else:
            print(f"  [!] Warning: Original file {file_path.name} no longer exists (likely renamed).")
        
        # Rename the new web-compatible file to .mp4
        final_out = file_path.with_suffix('.mp4')
        shutil.move(str(temp_out), str(final_out))
        print(f"  [✓] New file saved as {final_out.name}")
        
    except subprocess.CalledProcessError as e:
        print(f"  [!] Conversion failed for {file_path.name}: {e}")
        if temp_out.exists():
            temp_out.unlink()
            print("  [i] Cleaned up incomplete output file.")

def main():
    parser = argparse.ArgumentParser(description="Convert video files to web-optimized MP4 (H.264/AAC with +faststart).")
    parser.add_argument("target", nargs="?", help="File or directory containing media files to convert")
    parser.add_argument("-r", "--recursive", action="store_true", help="Search recursively in directory")
    args = parser.parse_args()

    target_path = args.target
    if not target_path and args.recursive:
        # Default to series directory when using recursive mode
        target_path = '/media/tushita/TUSHITA_W11_DATA/series/'
    elif not target_path:
        parser.error("The following arguments are required: target (unless -r is used to target the default series directory)")

    target = Path(target_path)
    
    if not target.exists():
        print(f"Error: The target path '{target}' does not exist.")
        sys.exit(1)
        
    if target.is_file():
        if target.suffix.lower() in VIDEO_EXTS:
            convert_file(target)
        else:
            print(f"Not a recognized video file: {target.name}")
    elif target.is_dir():
        # Use rglob if recursive flag is set, otherwise glob
        # We materialize the list into memory immediately to prevent 
        # FileNotFoundError if directories are renamed by other processes 
        # during long-running ffmpeg conversions.
        print(f"Scanning directory: {target}...")
        file_iterator = target.rglob('*') if args.recursive else target.glob('*')
        all_files = list(file_iterator)
        print(f"Found {len(all_files)} total items. Starting conversion pass...")
        
        for f in all_files:
            if f.is_file() and f.suffix.lower() in VIDEO_EXTS:
                # Do not process backups or already processed temp files
                if not f.name.endswith('.bak') and not f.name.endswith('.web.mp4'):
                    # Check if file still exists (might have been renamed by scrape/organize)
                    if f.exists():
                        convert_file(f)
                    else:
                        print(f"\nSkipping {f.name}: File no longer exists at this path.")

if __name__ == '__main__':
    main()
