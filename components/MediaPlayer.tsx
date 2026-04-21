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

      videoElement.style.margin = 'auto';
      videoElement.style.top = '0';
      videoElement.style.bottom = '0';
      videoElement.style.left = '0';
      videoElement.style.right = '0';

      videoRef.current.appendChild(videoElement);

      const player = videojs(videoElement, {
        controls: true,
        responsive: true,
        fluid: true,
        playbackRates: [0.5, 1, 1.25, 1.5, 2],
        html5: {
          vhs: {
            overrideNative: true
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
        sources: [{
          src: src,
          type: mimeType
        }]
      });

      playerRef.current = player;

      subtitles.forEach((subtitle) => {
        player.addRemoteTextTrack({
          kind: 'captions',
          src: subtitle.src,
          srclang: subtitle.srclang || 'en',
          label: subtitle.label || 'Subtitles',
          default: subtitle.default || false
        }, false);
      });

      player.on('error', () => {
        const error = player.error();
        console.error('Video.js Error:', error);
      });
    }
  }, [src, mimeType, subtitles]);

  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (playerRef.current && !playerRef.current.isDisposed() && src) {
      playerRef.current.src({
        src: src,
        type: mimeType
      });
      playerRef.current.load();
    }
  }, [src, mimeType]);

  return (
    <div className={'flex flex-col h-full ' + className}>
      <div className="flex-1 relative bg-background flex items-center justify-center min-h-0">
        <div ref={videoRef} className="w-full h-full" />
      </div>
    </div>
  );
}
