'use client';

import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface SubtitleTrack {
  src: string;
  srclang?: string;
  label?: string;
  default?: boolean;
}

interface MediaPlayerProps {
  id?: string | number;
  src: string;
  mimeType?: string;
  subtitles?: SubtitleTrack[];
  className?: string;
  title?: string;
}

// Correctly infer the Player type from the videojs function signature
type VideoJsPlayer = ReturnType<typeof videojs>;

export default function MediaPlayer({ 
  id,
  src, 
  mimeType = 'video/mp4', 
  subtitles = [], 
  className = '',
  title = 'Video'
}: MediaPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<VideoJsPlayer | null>(null);
  const [error, setError] = useState<{ code: number; message: string } | null>(null);
  const [isFlagged, setIsFlagged] = useState(false);

  const ctx = useRef({ id, src });
  useEffect(() => {
    ctx.current = { id, src };
  }, [id, src]);

  useEffect(() => {
    if (!playerRef.current && videoRef.current) {
      const videoElement = document.createElement('video');
      videoElement.classList.add('video-js', 'vjs-default-skin', 'vjs-big-play-centered', 'vjs-show-big-play-button-on-pause');
      
      // No crossorigin attribute needed for same-origin requests
      videoElement.setAttribute('playsinline', 'true');

      videoRef.current.appendChild(videoElement);

      const player = videojs(videoElement, {
        controls: true,
        responsive: true,
        fill: true,
        playbackRates: [0.5, 1, 1.25, 1.5, 2],
        html5: {
          vhs: {
            overrideNative: true
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        }
      });

      playerRef.current = player;

      player.on('loadedmetadata', () => {
        const currentCtx = ctx.current;
        const currentId = currentCtx.id || currentCtx.src;
        const storageKey = `mm_playback_time_${currentId}`;
        const savedTime = localStorage.getItem(storageKey);
        if (savedTime) {
          const time = parseFloat(savedTime);
          if (!isNaN(time) && time > 0) {
            player.currentTime(time);
          }
        }
      });

      player.on('timeupdate', () => {
        const currentCtx = ctx.current;
        const currentId = currentCtx.id || currentCtx.src;
        const storageKey = `mm_playback_time_${currentId}`;
        const currentTime = player.currentTime();
        const duration = player.duration();
        
        if (currentTime && duration) {
          if (currentTime < duration - 10) {
            localStorage.setItem(storageKey, currentTime.toString());
          } else {
            localStorage.removeItem(storageKey);
          }
        }
      });

      player.on('error', () => {
        const videoError = player.error();
        if (videoError) {
            setError({
                code: videoError.code,
                message: videoError.message || 'Media stream interference detected'
            });

            // Automatically flag for repair if we have an ID
            const currentCtx = ctx.current;
            if (currentCtx.id && !isFlagged) {
              fetch(`/api/movies/${currentCtx.id}/repair`, { method: 'POST' })
                .then(() => setIsFlagged(true))
                .catch(err => console.error('[MediaPlayer] Failed to flag for repair:', err));
            }
        }
      });
      
      // Clear error on new source
      player.on('loadstart', () => setError(null));
      
      // Initialize source
      player.src({ src, type: mimeType });
    }
  }, []);

  // Handle source and mimeType changes
  useEffect(() => {
    const player = playerRef.current;
    if (player && !player.isDisposed() && src) {
      player.src({
        src: src,
        type: mimeType
      });
      player.load();
    }
  }, [src, mimeType]);

  // Handle subtitle changes
  useEffect(() => {
    const player = playerRef.current;
    if (player && !player.isDisposed()) {
      player.ready(() => {
        // 1. Clear all existing remote text tracks
        const tracks = player.remoteTextTracks();
        for (let i = tracks.length - 1; i >= 0; i--) {
            const track = (tracks as any)[i];
            if (track) player.removeRemoteTextTrack(track);
        }

        // 2. Add new tracks
        if (subtitles && subtitles.length > 0) {
          subtitles.forEach((subtitle, index) => {
            const trackOptions = {
              kind: 'captions',
              src: subtitle.src,
              srclang: subtitle.srclang || 'en',
              label: subtitle.label || 'Subtitles',
              default: subtitle.default || (index === 0)
            };

            console.log(`[MediaPlayer] Registering track: ${trackOptions.label}`);
            
            const track = player.addRemoteTextTrack(trackOptions, false);
            
            // 3. Force 'showing' mode for the default track
            if (trackOptions.default) {
              if (track) {
                (track as any).mode = 'showing';
              }
            }
          });
        }
      });
    }
  }, [subtitles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div className={'relative w-full h-full group bg-black overflow-hidden ' + className}>
      <div ref={videoRef} className="absolute inset-0" />
      
      {/* Internal Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-8 text-center animate-in fade-in duration-500">
           <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-full mb-6">
              <AlertCircle className="h-10 w-10 text-destructive animate-pulse" />
           </div>
           <div className="space-y-2 max-w-md">
                <h3 className="text-xl font-bold text-foreground uppercase tracking-tight italic">Stream_Interruption</h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-60">Error Code {error.code}: {error.message}</p>
                <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                    The requested archive stream could not be stabilized. This may be due to unsupported encoding or temporary storage offline.
                </p>
           </div>
           <button 
                onClick={() => window.location.reload()}
                className="mt-10 px-8 py-3 bg-white text-black hover:bg-zinc-200 text-xs font-black uppercase tracking-widest rounded-full transition-all flex items-center gap-3 shadow-2xl"
           >
              <RefreshCcw className="h-4 w-4" /> Restart Session
           </button>
        </div>
      )}
    </div>
  );
}
