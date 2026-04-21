'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import TrackList = videojs.TrackList;

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
      videoElement.setAttribute('crossorigin', 'anonymous');
      videoElement.setAttribute('playsinline', 'true');

      videoElement.style.margin = 'auto';
      videoElement.style.top = '0';
      videoElement.style.bottom = '0';
      videoElement.style.left = '0';
      videoElement.style.right = '0';

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
        },
        sources: [{
          src: src,
          type: mimeType
        }]
      });

      playerRef.current = player;

      player.on('error', () => {
        const error = player.error();
        console.error('Video.js Error:', error);
      });
    }
  }, []); // Only run on mount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
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

  // Handle subtitle changes independently
  useEffect(() => {
    const player = playerRef.current;
    if (player && !player.isDisposed()) {
      // Remove all existing remote text tracks
      const tracks = player.remoteTextTracks();
      for (let i = tracks.length - 1; i >= 0; i--) {
        const track= tracks[i];
        player.removeRemoteTextTrack(track);
      }

      // Add new ones
      if (subtitles && subtitles.length > 0) {
        subtitles.forEach((subtitle, index) => {
          const track = player.addRemoteTextTrack({
            kind: 'captions',
            src: subtitle.src,
            srclang: subtitle.srclang || 'en',
            label: subtitle.label || 'Subtitles',
            default: subtitle.default || (index === 0) // Default to first track if none specified
          }, false);
          
          // Force showing the default track
          if (subtitle.default || index === 0) {
             // We need to wait for the track to be added to the DOM before setting mode
             // but addRemoteTextTrack returns a TextTrack object we can use
             if (track) {
                track.mode = 'showing';
             }
          }
        });
      }
    }
  }, [subtitles]);

  return (
    <div className={'relative w-full h-full ' + className}>
      <div ref={videoRef} className="absolute inset-0" />
    </div>
  );
}
