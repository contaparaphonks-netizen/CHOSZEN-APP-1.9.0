import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, RefreshCw, Youtube } from 'lucide-react';

interface YTPlayerInstance {
  destroy?: () => void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayerInstance;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Navegador indisponível'));
  }
  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      reject(new Error('Tempo esgotado ao carregar player oficial'));
    }, 10000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (typeof previousReady === 'function') {
        try {
          previousReady();
        } catch {
          // Ignore callback error
        }
      }
      if (window.YT && typeof window.YT.Player === 'function') {
        resolve(window.YT);
      } else {
        reject(new Error('Player oficial indisponível'));
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        ytApiPromise = null;
        reject(new Error('Falha ao carregar o player oficial do YouTube'));
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

interface YouTubeOfficialPlayerProps {
  videoId: string;
  title: string;
  youtubeUrl: string;
  chromeUrl?: string;
  onPlaybackBlocked?: () => void;
}

export function YouTubeOfficialPlayer({
  videoId,
  title,
  youtubeUrl,
  chromeUrl,
  onPlaybackBlocked,
}: YouTubeOfficialPlayerProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'blocked'>('loading');
  const [friendlyMessage, setFriendlyMessage] = useState<string>(
    'Esta transmissão restringiu a reprodução incorporada neste navegador.'
  );

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setFriendlyMessage('Esta transmissão restringiu a reprodução incorporada neste navegador.');

    const mountPlayer = async () => {
      try {
        const YT = await loadYouTubeIframeApi();
        if (cancelled || !containerRef.current) return;

        // Clean mount host before creating a fresh YT.Player
        containerRef.current.innerHTML = '';
        const targetEl = document.createElement('div');
        targetEl.id = `yt-player-${reactId}-${videoId}`;
        targetEl.className = 'w-full h-full';
        containerRef.current.appendChild(targetEl);

        playerRef.current = new YT.Player(targetEl, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (!cancelled) {
                setStatus('ready');
              }
            },
            onStateChange: (ev) => {
              if (!cancelled && (ev.data === 1 || ev.data === 2 || ev.data === 3)) {
                setStatus('ready');
              }
            },
            onError: (ev) => {
              if (cancelled) return;
              // Destroy iframe immediately so YouTube's internal error box is never shown
              try {
                playerRef.current?.destroy?.();
              } catch {
                // Ignore destroy error
              }
              if (containerRef.current) {
                containerRef.current.innerHTML = '';
              }
              if (ev.data === 101 || ev.data === 150 || ev.data === 153) {
                setFriendlyMessage(
                  'O canal oficial bloqueou a reprodução incorporada fora do YouTube para este vídeo.'
                );
              } else if (ev.data === 100) {
                setFriendlyMessage(
                  'Esta transmissão não está mais disponível para incorporação no momento.'
                );
              } else {
                setFriendlyMessage(
                  'Não foi possível carregar este vídeo dentro do painel. Assista diretamente no YouTube ou abra no Chrome.'
                );
              }
              setStatus('blocked');
              onPlaybackBlocked?.();
            },
          },
        });
      } catch {
        if (!cancelled) {
          setFriendlyMessage(
            'Não foi possível iniciar o player incorporado agora. Você pode assistir diretamente no YouTube ou abrir no Chrome.'
          );
          setStatus('blocked');
          onPlaybackBlocked?.();
        }
      }
    };

    mountPlayer();

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        // Ignore cleanup errors
      }
      playerRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [videoId, reactId]);

  const effectiveChromeUrl = chromeUrl || youtubeUrl;

  if (status === 'blocked') {
    return (
      <div className="aspect-video w-full rounded-xl bg-[#090B10] border border-white/[0.1] p-6 sm:p-8 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-sky-400" />
        </div>
        <div className="space-y-1.5 max-w-lg">
          <h5 className="font-display text-base font-bold text-white">
            Reprodução externa restrita pelo canal oficial
          </h5>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{friendlyMessage}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Youtube className="w-4 h-4 shrink-0" />
            <span>ASSISTIR NO YOUTUBE</span>
          </a>
          <a
            href={effectiveChromeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-5 rounded-xl bg-[#10141D] border border-white/[0.14] hover:border-blue-500/40 text-slate-100 hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <span>ABRIR NO CHROME</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/[0.12]">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 bg-[#090B10]/95 flex flex-col items-center justify-center gap-2.5 pointer-events-none px-4 text-center">
          <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
          <span className="text-xs text-slate-300 max-w-md truncate">
            Iniciando player oficial do YouTube — {title}
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" aria-label={title} />
    </div>
  );
}
