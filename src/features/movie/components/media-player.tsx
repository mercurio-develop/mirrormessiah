'use client';

import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import '@silvermine/videojs-chromecast/dist/silvermine-videojs-chromecast.css';
import '@silvermine/videojs-airplay/dist/silvermine-videojs-airplay.css';
import { AlertCircle, RefreshCcw, Volume2, Loader2, Subtitles } from 'lucide-react';
import type { AudioTrackInfo } from '@/lib/audio-remux';
import { audioPathKey, audioPreferenceKey, rebuildStreamSrc } from '@/lib/audio-path';

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
  poster?: string | null;
}

// Correctly infer the Player type from the videojs function signature
type VideoJsPlayer = ReturnType<typeof videojs>;

function clearRemoteTextTracks(player: VideoJsPlayer) {
  const tracks = player.remoteTextTracks();
  for (let i = tracks.length - 1; i >= 0; i--) {
    const track = (tracks as any)[i];
    if (track) player.removeRemoteTextTrack(track);
  }
}

function addRemoteTextTracks(player: VideoJsPlayer, tracks: SubtitleTrack[]) {
  clearRemoteTextTracks(player);
  if (!tracks.length) return;

  tracks.forEach((subtitle, index) => {
    const isDefault = subtitle.default || index === 0;
    const textTrack = player.addRemoteTextTrack(
      {
        kind: 'subtitles',
        src: subtitle.src,
        srclang: subtitle.srclang || 'en',
        label: subtitle.label || 'Subtitles',
        default: isDefault,
      },
      false,
    );

    if (textTrack) {
      const track = (textTrack as { track?: TextTrack }).track;
      if (track) track.mode = isDefault ? 'showing' : 'disabled';
    }
  });
}

function setActiveTextTrack(player: VideoJsPlayer, trackIndex: number | null) {
  const tracks = player.remoteTextTracks() as unknown as TextTrack[];
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = trackIndex === i ? 'showing' : 'disabled';
  }
}

const CAST_SENDER_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

function loadCastSenderScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  const w = window as Window & { cast?: { framework?: unknown } };
  if (w.cast?.framework) return Promise.resolve();

  const existing = document.querySelector(`script[src="${CAST_SENDER_URL}"]`) as HTMLScriptElement | null;
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Cast sender failed to load')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CAST_SENDER_URL;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('Cast sender failed to load'));
    document.head.appendChild(script);
  });
}

export function MediaPlayer({ 
  id,
  src, 
  mimeType = 'video/mp4', 
  subtitles = [], 
  className = '',
  title = 'Video',
  poster = null
}: MediaPlayerProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<VideoJsPlayer | null>(null);
  const [error, setError] = useState<{ code: number; message: string } | null>(null);
  const [isFlagged, setIsFlagged] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState<number | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [isSwappingAudio, setIsSwappingAudio] = useState(false);

  const ctx = useRef({ id, src });
  const subtitlesRef = useRef(subtitles);
  const lastSrcRef = useRef(src);
  const mimeTypeRef = useRef(mimeType);
  const [effectiveSrc, setEffectiveSrc] = useState(src);

  useEffect(() => {
    mimeTypeRef.current = mimeType;
  }, [mimeType]);

  useEffect(() => {
    subtitlesRef.current = subtitles;
  }, [subtitles]);

  useEffect(() => {
    ctx.current = { id, src };
  }, [id, src]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setEffectiveSrc(src);
      return;
    }

    const currentId = id || src;
    const savedPath = localStorage.getItem(audioPathKey(currentId));
    const savedTrack = localStorage.getItem(audioPreferenceKey(currentId));

    let sourcePath: string | null = null;
    try {
      sourcePath = new URL(src, window.location.origin).searchParams.get('path');
    } catch {
      sourcePath = null;
    }

    if (!savedPath || !savedTrack || !sourcePath) {
      setEffectiveSrc(src);
      return;
    }

    fetch(
      `/api/audio/resolve?source=${encodeURIComponent(sourcePath)}&track=${encodeURIComponent(savedTrack)}`,
      { credentials: 'same-origin' },
    )
      .then((res) => (res.ok ? res.json() : { valid: false }))
      .then((data: { valid?: boolean; encodedPath?: string }) => {
        if (data.valid && data.encodedPath) {
          setEffectiveSrc(rebuildStreamSrc(src, data.encodedPath));
          return;
        }
        localStorage.removeItem(audioPathKey(currentId));
        localStorage.removeItem(audioPreferenceKey(currentId));
        setEffectiveSrc(src);
      })
      .catch(() => setEffectiveSrc(src));
  }, [id, src]);

  // Fetch audio tracks from API (avoids server-action timeouts on large libraries)
  useEffect(() => {
    if (!effectiveSrc || typeof window === 'undefined') return;

    try {
      const urlObj = new URL(effectiveSrc, window.location.origin);
      const encodedPath = urlObj.searchParams.get('path');
      if (!encodedPath) return;

      fetch(`/api/audio/tracks?path=${encodeURIComponent(encodedPath)}`, {
        credentials: 'same-origin',
      })
        .then((res) => (res.ok ? res.json() : { tracks: [] }))
        .then((data: { tracks?: AudioTrackInfo[] }) => {
          const tracks = data.tracks || [];
          setAudioTracks(tracks.length > 1 ? tracks : []);
        })
        .catch((e) => console.error('Error fetching audio tracks', e));
    } catch (e) {
      console.error('Could not parse src URL for audio tracks', e);
    }
  }, [effectiveSrc]);

  const swapStreamSource = (newSrc: string, resumeAt: number) => {
    lastSrcRef.current = newSrc;
    setEffectiveSrc(newSrc);

    const player = playerRef.current;
    if (!player || player.isDisposed()) return;

    const wasPaused = player.paused();
    player.src({ src: newSrc, type: mimeTypeRef.current });
    player.load();

    const onReady = () => {
      if (resumeAt > 0) {
        player.currentTime(resumeAt);
      }
      if (!wasPaused) {
        player.play()?.catch(() => {});
      }
      player.off('loadedmetadata', onReady);
    };
    player.on('loadedmetadata', onReady);
  };

  const handleTrackSelect = async (trackIndex: number) => {
    if (isSwappingAudio) return;

    let encodedPath: string | null = null;
    try {
      const urlObj = new URL(src, window.location.origin);
      encodedPath = urlObj.searchParams.get('path');
    } catch {
      // ignore parse errors
    }

    if (!encodedPath) return;

    setShowAudioMenu(false);
    setIsSwappingAudio(true);

    const resumeAt = playerRef.current?.currentTime() || 0;
    const currentId = id || src;
    const storageKey = `mm_playback_time_${currentId}`;
    if (resumeAt > 0) {
      localStorage.setItem(storageKey, resumeAt.toString());
    }

    try {
      const response = await fetch('/api/audio/switch', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: encodedPath, trackIndex }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        encodedPath?: string;
        error?: string;
      };

      if (response.ok && result.success && result.encodedPath) {
        localStorage.setItem(audioPathKey(currentId), result.encodedPath);
        localStorage.setItem(audioPreferenceKey(currentId), String(trackIndex));
        const newSrc = rebuildStreamSrc(src, result.encodedPath, true);
        swapStreamSource(newSrc, resumeAt);
        setAudioTracks((tracks) =>
          tracks.map((track) => ({
            ...track,
            isDefault: track.index === trackIndex,
          })),
        );
      } else {
        alert(result.error || 'Failed to switch audio track.');
      }
    } catch (err) {
      console.error('[MediaPlayer] Audio track switch failed:', err);
      alert('Failed to switch audio track. The remux may have timed out on a large file.');
    } finally {
      setIsSwappingAudio(false);
    }
  };

  const handleSubtitleSelect = (trackIndex: number | null) => {
    setShowSubtitleMenu(false);
    setActiveSubtitleIndex(trackIndex);
    const player = playerRef.current;
    if (player && !player.isDisposed()) {
      setActiveTextTrack(player, trackIndex);
    }
  };

  useEffect(() => {
    if (playerRef.current || !videoRef.current) return;

    let cancelled = false;

    const initPlayer = async () => {
      try {
        await loadCastSenderScript();
      } catch (err) {
        console.warn('[MediaPlayer] Cast sender unavailable:', err);
      }

      if (cancelled || playerRef.current || !videoRef.current) return;

      const videoElement = document.createElement('video');
      videoElement.classList.add('video-js', 'vjs-default-skin', 'vjs-big-play-centered', 'vjs-show-big-play-button-on-pause');

      
      // No crossorigin attribute needed for same-origin requests
      videoElement.setAttribute('playsinline', 'true');
      videoElement.setAttribute('x-webkit-airplay', 'allow');

      videoRef.current.appendChild(videoElement);

      if (typeof window !== 'undefined') {
        if (!videojs.getPlugin('chromecast')) {
          require('@silvermine/videojs-chromecast')(videojs, { preloadWebComponents: true });
        }
        if (!videojs.getPlugin('airPlay')) {
          require('@silvermine/videojs-airplay')(videojs);
        }
      }

      const savedVolume = parseFloat(localStorage.getItem('mm_player_volume') || '0.8');

      const player = videojs(videoElement, {
        controls: true,
        responsive: true,
        fill: true,
        poster: poster || undefined,
        techOrder: ['chromecast', 'html5'],
        plugins: {
          chromecast: {
            addCastLabelToButton: true,
          },
          airPlay: {
            addAirPlayLabelToButton: true,
          }
        },
        playbackRates: [0.5, 1, 1.25, 1.5, 2],
        controlBar: {
          children: [
            'playToggle',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'playbackRateMenuButton',
            'subsCapsButton',
            'audioTrackButton',
            'chromecastButton',
            'airPlayButton',
            'fullscreenToggle',
          ],
        },
        volume: Math.min(savedVolume, 1),
        sources: effectiveSrc ? [{ src: effectiveSrc, type: mimeType }] : undefined
      });

      playerRef.current = player;

      const syncTracks = () => {
        if (player.isDisposed()) return;
        addRemoteTextTracks(player, subtitlesRef.current);
        const defaultIdx = subtitlesRef.current.findIndex((t) => t.default);
        const idx = defaultIdx >= 0 ? defaultIdx : subtitlesRef.current.length > 0 ? 0 : null;
        setActiveSubtitleIndex(idx);
        if (idx !== null) {
          setActiveTextTrack(player, idx);
        }
      };

      player.ready(() => {
        setPlayerReady(true);
        syncTracks();
      });

      player.on('loadedmetadata', syncTracks);

      // Expose to component level so unmount can read it
      (player as any)._mmState = { restoreAttempted: false, targetTime: 0 };

      const doRestore = () => {
        const state = (player as any)._mmState;
        if (state.restoreAttempted || state.targetTime <= 0) return;

        const ct = player.currentTime();
        if (ct !== undefined && Math.abs(ct - state.targetTime) < 2) {
            state.restoreAttempted = true;
            return;
        }

        player.currentTime(state.targetTime);
      };

      player.on('loadedmetadata', () => {
        const state = (player as any)._mmState;
        state.restoreAttempted = false;
        state.targetTime = 0;

        const currentCtx = ctx.current;
        const currentId = currentCtx.id || currentCtx.src;
        const storageKey = `mm_playback_time_${currentId}`;
        const savedTime = localStorage.getItem(storageKey);
        if (savedTime) {
          const time = parseFloat(savedTime);
          if (!isNaN(time) && time > 0) {
            state.targetTime = time;
            doRestore();
          } else {
            state.restoreAttempted = true;
          }
        } else {
          state.restoreAttempted = true;
        }
      });

      // Persist volume across sessions
      player.on('volumechange', () => {
        localStorage.setItem('mm_player_volume', String(player.volume()));
      });

      // Cap volume when casting starts so TV doesn't blast at 100%
      player.on('chromecastConnected', () => {
        if ((player.volume() ?? 1) > 0.7) player.volume(0.7);
      });

      player.on('canplay', doRestore);
      // No play-event restore: calling currentTime() during 'play' on iOS aborts playback
      player.on('playing', () => {
        const state = (player as any)._mmState;
        if (!state.restoreAttempted && state.targetTime > 0) {
            doRestore();
        }
      });

      player.on('timeupdate', () => {
        const state = (player as any)._mmState;
        const ct = player.currentTime();
        if (state.targetTime > 0 && !state.restoreAttempted) {
             if (ct !== undefined && Math.abs(ct - state.targetTime) < 5) {
                 state.restoreAttempted = true;
             } else {
                 return;
             }
        }

        const currentCtx = ctx.current;
        const currentId = currentCtx.id || currentCtx.src;
        const storageKey = `mm_playback_time_${currentId}`;
        const duration = player.duration();

        if (ct !== undefined && duration !== undefined) {
          if (ct < duration - 10) {
            localStorage.setItem(storageKey, ct.toString());
          } else {
            localStorage.removeItem(storageKey);
          }
        }
      });

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden' && playerRef.current && !playerRef.current.isDisposed()) {
             const state = (playerRef.current as any)._mmState;
             const currentTime = playerRef.current.currentTime();
             const duration = playerRef.current.duration();
             const currentCtx = ctx.current;
             const currentId = currentCtx.id || currentCtx.src;
             const storageKey = `mm_playback_time_${currentId}`;

             if (currentTime !== undefined && duration && state?.restoreAttempted) {
                 if (currentTime < duration - 10) {
                     localStorage.setItem(storageKey, currentTime.toString());
                 }
             }
        }
      };      document.addEventListener('visibilitychange', handleVisibilityChange);

      player.on('dispose', () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
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
              fetch(`/api/movies/${currentCtx.id}/repair`, { method: 'POST', credentials: 'same-origin' })
                .then(() => setIsFlagged(true))
                .catch(err => console.error('[MediaPlayer] Failed to flag for repair:', err));
            }
        }
      });
      
      // Clear error on new source
      player.on('loadstart', () => setError(null));

      // NEW: Clear repair flag on successful playback
      player.on('playing', () => {
        const currentCtx = ctx.current;
        if (currentCtx.id) {
          fetch(`/api/movies/${currentCtx.id}/repair`, { method: 'DELETE', credentials: 'same-origin' })
            .catch(err => console.error('[MediaPlayer] Failed to clear repair flag:', err));
        }
      });

      // Do not initialize player.src here, the second useEffect will handle it
    };

    void initPlayer();

    return () => {
      cancelled = true;
    };
  }, []); // Run initialization exactly once on mount

      // Handle source and mimeType changes
      useEffect(() => {
      const player = playerRef.current;
      if (player && !player.isDisposed() && effectiveSrc && effectiveSrc !== lastSrcRef.current) {
      lastSrcRef.current = effectiveSrc;
      player.src({
        src: effectiveSrc,
        type: mimeType
      });
      player.load();
      }
      }, [effectiveSrc, mimeType]);

  useEffect(() => {
    if (!playerReady) return;
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;

    addRemoteTextTracks(player, subtitles);
    const defaultIdx = subtitles.findIndex((t) => t.default);
    const idx = defaultIdx >= 0 ? defaultIdx : subtitles.length > 0 ? 0 : null;
    setActiveSubtitleIndex(idx);
    if (idx !== null) {
      setActiveTextTrack(player, idx);
    }
  }, [playerReady, subtitles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        const state = (playerRef.current as any)._mmState;
        const ct = playerRef.current.currentTime();
        const duration = playerRef.current.duration();
        const currentCtx = ctx.current;
        const currentId = currentCtx.id || currentCtx.src;

        if (ct !== undefined && duration !== undefined && state?.restoreAttempted) {
             const storageKey = `mm_playback_time_${currentId}`;
             if (ct < duration - 10) {
                 localStorage.setItem(storageKey, ct.toString());
             }
        }

        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div className={'relative w-full h-full group bg-black overflow-hidden ' + className}>
      <div ref={videoRef} className="absolute inset-0" />
      
      {/* Audio Track Selection Overlay */}
      {audioTracks.length > 1 && (
        <div className="absolute top-4 left-4 z-40">
          <button 
            onClick={() => setShowAudioMenu(!showAudioMenu)}
            disabled={isSwappingAudio}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/70 hover:bg-black/90 border border-white/20 text-white text-xs font-bold uppercase tracking-wider rounded-md backdrop-blur-sm transition-all shadow-lg"
          >
            {isSwappingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
            {isSwappingAudio ? 'Remuxing...' : 'Audio'}
          </button>
          
          {showAudioMenu && (
            <div className="absolute top-full left-0 mt-2 w-48 bg-black/95 border border-white/20 rounded-md shadow-2xl overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-top-2">
              <div className="px-3 py-2 bg-white/5 border-b border-white/10 text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                Select Audio Language
              </div>
              <div className="max-h-64 overflow-y-auto">
                {audioTracks.map((track) => (
                  <button
                    key={track.index}
                    onClick={() => handleTrackSelect(track.index)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${track.isDefault ? 'border-l-2 border-primary bg-primary/5 text-primary font-bold' : 'text-foreground'}`}
                  >
                    <div className="font-medium">{track.title || track.language}</div>
                    <div className="text-[10px] text-muted-foreground uppercase opacity-70">
                      Track {track.index} • {track.codec}
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-3 py-2 bg-destructive/10 border-t border-white/10 text-[10px] text-destructive leading-tight italic">
                First switch may take 1–2 minutes while a cached copy is built. Playback resumes automatically.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtitle Selection Overlay */}
      {subtitles.length > 0 && (
        <div className="absolute top-4 right-4 z-40">
          <button
            type="button"
            onClick={() => {
              setShowSubtitleMenu((open) => !open);
              setShowAudioMenu(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 border text-white text-xs font-bold uppercase tracking-wider rounded-md backdrop-blur-sm transition-all shadow-lg ${
              activeSubtitleIndex !== null
                ? 'bg-primary/80 hover:bg-primary border-primary/40'
                : 'bg-black/70 hover:bg-black/90 border-white/20'
            }`}
          >
            <Subtitles className="h-4 w-4" />
            CC
          </button>

          {showSubtitleMenu && (
            <div className="absolute top-full right-0 mt-2 w-52 bg-black/95 border border-white/20 rounded-md shadow-2xl overflow-hidden backdrop-blur-md animate-in fade-in slide-in-from-top-2">
              <div className="px-3 py-2 bg-white/5 border-b border-white/10 text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                Subtitles
              </div>
              <div className="max-h-64 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => handleSubtitleSelect(null)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                    activeSubtitleIndex === null ? 'border-l-2 border-primary bg-primary/5 text-primary font-bold' : 'text-foreground'
                  }`}
                >
                  Off
                </button>
                {subtitles.map((track, index) => (
                  <button
                    key={`${track.src}-${index}`}
                    type="button"
                    onClick={() => handleSubtitleSelect(index)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                      activeSubtitleIndex === index ? 'border-l-2 border-primary bg-primary/5 text-primary font-bold' : 'text-foreground'
                    }`}
                  >
                    {track.label || track.srclang || `Track ${index + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
                    The requested archive stream could not be stabilized. This is likely an unsupported legacy format (like AVI or MKV with incompatible codecs) that your browser cannot decode natively.
                </p>
           </div>
           
           <div className="flex flex-col sm:flex-row items-center gap-4 mt-10">
             <button 
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-white/10 text-white hover:bg-white/20 border border-white/20 text-xs font-black uppercase tracking-widest rounded-full transition-all flex items-center gap-2"
             >
                <RefreshCcw className="h-4 w-4" /> Retry
             </button>
           </div>
        </div>
      )}
    </div>
  );
}
