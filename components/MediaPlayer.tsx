'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

interface SubtitleTrack {
  src: string;
  srclang?: string;
  label?: string;
  default?: boolean;
}

interface MediaPlayerProps {
  src: string;
  mimeType?: string;
  subtitles?: SubtitleTrack[];
  className?: string;
  title?: string;
}

// Correctly infer the Player type from the videojs function signature
type VideoJsPlayer = ReturnType<typeof videojs>;

export default function MediaPlayer({ 
  src, 
  mimeType = 'video/mp4', 
  subtitles = [], 
  className = '',
  title = 'Video'
}: MediaPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<VideoJsPlayer | null>(null);

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

      player.on('error', () => {
        const error = player.error();
        console.error('Video.js Error:', error);
      });
      
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
    <div className={'relative w-full h-full ' + className}>
      <div ref={videoRef} className="absolute inset-0" />
    </div>
  );
}
