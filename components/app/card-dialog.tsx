'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ImageIcon,
  Loader2,
  Share2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const toInitialCap = (str: string): string => {
  if (!str) return '';
  const lower = str.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/**
 * Preview a share card, then copy or save it.
 *
 * The image is fetched once into a blob: the same bytes then feed the preview,
 * the clipboard and the download, so what someone pastes is exactly what they
 * looked at rather than a second render a few seconds later.
 */
const BACKGROUNDS = [
  { key: 'whale', label: 'Whale' },
  { key: 'colossus', label: 'Colossus' },
  { key: 'monster', label: 'Monster' },
  { key: 'treasure', label: 'Treasure' },
  { key: 'voyage', label: 'Voyage' },
];

const PREVIEW_BG: Record<string, { profit: string; loss: string; rawProfit: string; rawLoss: string }> = {
  whale: {
    profit: '/pnl/blurred/whale_profit.jpg',
    loss: '/pnl/blurred/whale_loss.jpg',
    rawProfit: '/pnl/raw/whale_profit.jpg',
    rawLoss: '/pnl/raw/whale_loss.jpg',
  },
  colossus: {
    profit: '/pnl/blurred/colossus_profit.jpg',
    loss: '/pnl/blurred/colossus_loss.jpg',
    rawProfit: '/pnl/raw/colossus_profit.jpg',
    rawLoss: '/pnl/raw/colossus_loss.jpg',
  },
  monster: {
    profit: '/pnl/blurred/monster_profit.jpg',
    loss: '/pnl/blurred/monster_loss.jpg',
    rawProfit: '/pnl/raw/monster_profit.jpg',
    rawLoss: '/pnl/raw/monster_loss.jpg',
  },
  treasure: {
    profit: '/pnl/blurred/treasure_profit.jpg',
    loss: '/pnl/blurred/treasure_loss.jpg',
    rawProfit: '/pnl/raw/treasure_profit.jpg',
    rawLoss: '/pnl/raw/treasure_loss.jpg',
  },
  voyage: {
    profit: '/pnl/blurred/voyage_profit.jpg',
    loss: '/pnl/blurred/voyage_loss.jpg',
    rawProfit: '/pnl/raw/voyage_profit.jpg',
    rawLoss: '/pnl/raw/voyage_loss.jpg',
  },
};

const CUSTOM = 'custom';
const STORE_KEY = 'invictus.cardBackground';

/** Wide enough that the card looks sharp at 2x, small enough to process rapidly in O(N). */
const PHOTO_WIDTH = 1400;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });

type ValidatedMediaType = 'image' | 'video';

interface ValidatedMediaResult {
  type: ValidatedMediaType;
  mime: string;
  ext: string;
}

/**
 * Sniff file magic bytes (file signatures) to prevent MIME spoofing, SVG XSS,
 * HTML injection, and polyglot attacks before passing bytes to any decoder.
 */
const sniffMediaSignature = async (file: File): Promise<ValidatedMediaResult> => {
  const slice = file.slice(0, 32);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 4) {
    throw new Error('File is too small or corrupted.');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { type: 'image', mime: 'image/png', ext: 'png' };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: 'image', mime: 'image/jpeg', ext: 'jpg' };
  }

  // WebP: RIFF (0-3) + WEBP (8-11)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { type: 'image', mime: 'image/webp', ext: 'webp' };
  }

  // WebM / Matroska EBML: 1A 45 DF A3
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return { type: 'video', mime: 'video/webm', ext: 'webm' };
  }

  // MP4 / QuickTime: bytes 4-7 = 'ftyp', 'moov', or 'mdat'
  if (bytes.length >= 8) {
    const box = String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);
    if (box === 'ftyp' || box === 'moov' || box === 'mdat') {
      return { type: 'video', mime: 'video/mp4', ext: 'mp4' };
    }
  }

  throw new Error('Unsupported or untrusted file format. Only verified PNG, JPEG, WebP, MP4, and WebM files are allowed.');
};

/**
 * Sanitize and downscale image in O(N) single-pass GPU-accelerated canvas.
 * Enforces pixel flood (decompression bomb) and memory limits.
 */
const processImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_DIMENSION = 4096;
    const MAX_PIXELS = 16_000_000; // 16 megapixels

    if (file.size > MAX_FILE_SIZE) {
      return reject(new Error('Image size exceeds 5MB limit.'));
    }

    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let cleanupDone = false;
    const cleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(blobUrl);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Image processing timed out.'));
    }, 4000);

    img.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Could not decode image file.'));
    };

    img.onload = () => {
      clearTimeout(timer);
      try {
        if (img.naturalWidth > MAX_DIMENSION || img.naturalHeight > MAX_DIMENSION) {
          throw new Error(`Image dimensions (${img.naturalWidth}×${img.naturalHeight}) exceed safe limit (${MAX_DIMENSION}×${MAX_DIMENSION}).`);
        }
        if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
          throw new Error('Image exceeds safe pixel count (16 megapixels).');
        }

        const targetW = PHOTO_WIDTH;
        const scale = Math.min(1, targetW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Canvas 2D unavailable');

        ctx.drawImage(img, 0, 0, w, h);
        cleanup();
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error('Image downscale failed.'));
      }
    };
    img.src = blobUrl;
  });

const MAX_VIDEO_DURATION = 30; // 30s limit

/**
 * Render complete composite video baking the card overlay, dark backdrop, and audio
 * into the video frames BEFORE playback. Ensures fullscreen retains the PnL overlay
 * and downloads save the complete rendered video file.
 */
const renderCompositeVideo = async (
  videoSrc: string,
  overlayBlob: Blob,
  blur: boolean,
  muteAudio: boolean,
  onProgress?: (pct: number) => void,
): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> => {
  const overlayUrl = URL.createObjectURL(overlayBlob);
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  const offscreenVideo = document.createElement('video');
  offscreenVideo.src = videoSrc;
  if (!videoSrc.startsWith('blob:') && !videoSrc.startsWith('data:')) {
    offscreenVideo.crossOrigin = 'anonymous';
  }
  offscreenVideo.muted = true;
  offscreenVideo.defaultMuted = true;
  offscreenVideo.playsInline = true;
  offscreenVideo.preload = 'auto';
  offscreenVideo.style.position = 'fixed';
  offscreenVideo.style.top = '-9999px';
  offscreenVideo.style.left = '-9999px';
  offscreenVideo.style.width = '1px';
  offscreenVideo.style.height = '1px';
  offscreenVideo.style.opacity = '0';
  offscreenVideo.style.pointerEvents = 'none';
  document.body.appendChild(offscreenVideo);
  offscreenVideo.load();

  try {
    const overlayImg = await loadImage(overlayUrl);

    await new Promise<void>((resolve) => {
      if (offscreenVideo.readyState >= 1) return resolve();
      const onDone = () => resolve();
      offscreenVideo.onloadedmetadata = onDone;
      offscreenVideo.onloadeddata = onDone;
      offscreenVideo.oncanplay = onDone;
      offscreenVideo.onerror = onDone;
      setTimeout(resolve, 2500);
    });

    const rawDuration =
      Number.isFinite(offscreenVideo.duration) && offscreenVideo.duration > 0
        ? offscreenVideo.duration
        : 5;
    const totalDuration = Math.min(rawDuration, MAX_VIDEO_DURATION);

    const width = 1280;
    const height = 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    const canvasStream = canvas.captureStream(30);
    stream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => stream!.addTrack(track));

    if (!muteAudio) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
          const source = audioCtx.createMediaElementSource(offscreenVideo);
          const dest = audioCtx.createMediaStreamDestination();
          source.connect(dest);
          dest.stream.getAudioTracks().forEach((track) => stream!.addTrack(track));
          if (audioCtx.state === 'suspended') {
            void audioCtx.resume().catch(() => {});
          }
        }
      } catch (err) {
        console.warn('AudioContext routing failed, trying fallback:', err);
        try {
          const videoStream =
            typeof (offscreenVideo as any).captureStream === 'function'
              ? (offscreenVideo as any).captureStream()
              : null;
          if (videoStream) {
            videoStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
              stream!.addTrack(track);
            });
          }
        } catch {}
      }
    }

    const hasAudio = stream.getAudioTracks().length > 0;
    const isMp4Supported =
      typeof MediaRecorder !== 'undefined' &&
      (hasAudio
        ? MediaRecorder.isTypeSupported('video/mp4')
        : MediaRecorder.isTypeSupported('video/mp4; codecs=avc1') || MediaRecorder.isTypeSupported('video/mp4'));

    const mimeType = isMp4Supported
      ? 'video/mp4'
      : hasAudio && MediaRecorder.isTypeSupported('video/webm; codecs="vp9, opus"')
        ? 'video/webm; codecs="vp9, opus"'
        : MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
          ? 'video/webm; codecs=vp9'
          : 'video/webm';

    const ext: 'mp4' | 'webm' = isMp4Supported ? 'mp4' : 'webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 6_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const recordingPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
      recorder.onerror = (e) => reject(e);
    });

    // Calculate cover scaling
    const vw = offscreenVideo.videoWidth || width;
    const vh = offscreenVideo.videoHeight || height;
    const scale = Math.max(width / vw, height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (width - dw) * 0.5;
    const dy = (height - dh) * 0.5;

    offscreenVideo.currentTime = 0;
    await new Promise<void>((resolve) => {
      offscreenVideo.onseeked = () => resolve();
      setTimeout(resolve, 150);
    });

    recorder.start(100);
    await offscreenVideo.play().catch(() => {});

    const startTime = performance.now();
    const fps = 30;
    const intervalMs = 1000 / fps;

    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        const cur = offscreenVideo.currentTime;
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(100, Math.round((Math.max(cur, elapsed) / totalDuration) * 100));
        if (onProgress) onProgress(progress);

        if (cur >= totalDuration || elapsed >= totalDuration || offscreenVideo.ended) {
          clearInterval(timer);
          resolve();
          return;
        }

        ctx.save();
        if (blur) {
          ctx.filter = 'blur(4px)';
          ctx.drawImage(offscreenVideo, dx - 10, dy - 10, dw + 20, dh + 20);
          ctx.filter = 'none';
        } else {
          ctx.drawImage(offscreenVideo, dx, dy, dw, dh);
        }

        // Ambient dark backdrop
        ctx.fillStyle = 'rgba(2, 4, 8, 0.4)';
        ctx.fillRect(0, 0, width, height);

        // Card overlay
        ctx.drawImage(overlayImg, 0, 0, width, height);
        ctx.restore();
      }, intervalMs);
    });

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    offscreenVideo.pause();

    const blob = await recordingPromise;
    return { blob, ext };
  } finally {
    URL.revokeObjectURL(overlayUrl);
    offscreenVideo.pause();
    offscreenVideo.src = '';
    if (offscreenVideo.parentNode) {
      offscreenVideo.parentNode.removeChild(offscreenVideo);
    }
    if (audioCtx) {
      try {
        void audioCtx.close();
      } catch {}
    }
    if (stream) {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch {}
    }
  }
};

/**
 * Capture a single sharp PNG snapshot of the current video frame for clipboard copy.
 */
const copyCurrentFrame = async (videoEl: HTMLVideoElement): Promise<Blob> => {
  const width = 1280;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(videoEl, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Snapshot failed'))), 'image/png');
  });
};

/** The photo/video keyframe, cropped to cover and centred, with the rendered card drawn over it. O(N) canvas blit. */
const underlay = async (card: Blob, photo: string): Promise<Blob> => {
  const cardUrl = URL.createObjectURL(card);
  try {
    const [top, pic] = await Promise.all([loadImage(cardUrl), loadImage(photo)]);
    const canvas = document.createElement('canvas');
    canvas.width = top.naturalWidth;
    canvas.height = top.naturalHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not draw the card');
    const scale = Math.max(canvas.width / pic.width, canvas.height / pic.height);
    const w = pic.width * scale;
    const h = pic.height * scale;
    ctx.drawImage(pic, (canvas.width - w) * 0.5, (canvas.height - h) * 0.5, w, h);
    ctx.drawImage(top, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export composite card'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(cardUrl);
  }
};

/** The bottom-row stats of each card, by the labels src/card.ts draws and matches on. */
const PERIOD_STATS = ['VOLUME', 'WIN RATE', 'POSITIONS', 'BIGGEST WIN'];
const STATS: Record<string, string[]> = {
  position: ['DEPOSITED', 'VALUE', 'FEES', 'FILLED', 'PNL'],
  trade: ['DEPOSITED', 'EXIT', 'FEES EARNED', 'PNL'],
  token: ['CAPITAL', 'VOLUME', 'FEES', 'WIN RATE'],
  daily: PERIOD_STATS,
  weekly: PERIOD_STATS,
  biweekly: PERIOD_STATS,
  fortnight: PERIOD_STATS,
  '14d': PERIOD_STATS,
  '7d': PERIOD_STATS,
  '30d': PERIOD_STATS,
  monthly: PERIOD_STATS,
  period: PERIOD_STATS,
  portfolio: ['NET WORTH', 'IN ETH', 'TODAY', 'POSITIONS'],
  calendar: ['DAYS TRADED', 'GREEN', 'RED', 'MONTH'],
};

/** Which stats are left off, per kind of card, remembered in this browser like the background. */
const useHidden = (kind: string): [string[], (label: string) => void] => {
  const normalizedKind =
    kind === 'weekly' ||
    kind === 'biweekly' ||
    kind === 'monthly' ||
    kind === '14d' ||
    kind === '7d' ||
    kind === '30d' ||
    kind === 'fortnight'
      ? 'period'
      : kind;
  const key = `invictus.cardHide.${normalizedKind}`;
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (Array.isArray(saved)) setHidden(saved.filter((s): s is string => typeof s === 'string'));
    } catch {
      // Blocked or unreadable storage: every stat shows.
    }
  }, [key]);

  const toggle = (label: string): void =>
    setHidden((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // The choice still applies to this card.
      }
      return next;
    });

  return [hidden, toggle];
};

/** Cards whose big figure is a PnL that also exists as a percentage. */
const BIG_KINDS: ReadonlySet<string> = new Set(['position', 'trade', 'token']);
const BIG_KEY = 'invictus.cardBig';

const useBigAs = (): ['usd' | 'pct', (v: 'usd' | 'pct') => void] => {
  const [big, setBig] = useState<'usd' | 'pct'>('usd');

  useEffect(() => {
    try {
      if (localStorage.getItem(BIG_KEY) === 'pct') setBig('pct');
    } catch {
      // Blocked storage: dollars.
    }
  }, []);

  return [
    big,
    (v) => {
      setBig(v);
      try {
        localStorage.setItem(BIG_KEY, v);
      } catch {
        // The choice still applies to this card.
      }
    },
  ];
};

const CURRENCY_KEY = 'invictus.cardCurrency';

const useCardCurrency = (): ['usd' | 'idr', (v: 'usd' | 'idr') => void] => {
  const [curr, setCurr] = useState<'usd' | 'idr'>('usd');

  useEffect(() => {
    try {
      if (localStorage.getItem(CURRENCY_KEY) === 'idr') setCurr('idr');
    } catch {
      // Blocked storage: default USD.
    }
  }, []);

  return [
    curr,
    (v) => {
      setCurr(v);
      try {
        localStorage.setItem(CURRENCY_KEY, v);
      } catch {
        // The choice still applies to this card.
      }
    },
  ];
};

const BLUR_KEY = 'invictus.cardBlur';

const useCardBlur = (): [boolean, (v: boolean) => void] => {
  const [blur, setBlur] = useState<boolean>(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(BLUR_KEY);
      if (saved !== null) setBlur(saved === 'true');
    } catch {
      // Storage blocked: default true.
    }
  }, []);

  return [
    blur,
    (v) => {
      setBlur(v);
      try {
        localStorage.setItem(BLUR_KEY, String(v));
      } catch {
        // Ignored
      }
    },
  ];
};

/**
 * The chosen background, kept in the browser.
 */
const useBackground = (): [string, (v: string) => void] => {
  const [bg, setBg] = useState('whale');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && (saved === CUSTOM || BACKGROUNDS.some((b) => b.key === saved))) setBg(saved);
    } catch {
      // A browser with storage blocked still gets the default.
    }
  }, []);

  return [
    bg,
    (v: string) => {
      setBg(v);
      try {
        localStorage.setItem(STORE_KEY, v);
      } catch {
        // Not worth telling anyone: the choice still applies to this card.
      }
    },
  ];
};

export const CardDialog = ({
  kind,
  params,
  title,
  label,
  variant = 'outline',
  size = 'sm',
  className,
  allowPeriodSwitch = false,
  initialPeriod = '30d',
  isProfit = true,
}: {
  kind: string;
  params?: string;
  title: string;
  label: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
  className?: string;
  allowPeriodSwitch?: boolean;
  initialPeriod?: '7d' | '14d' | '30d';
  isProfit?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '14d' | '30d'>(initialPeriod);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep selectedPeriod synced whenever the parent's timeframe changes or dialog opens
  useEffect(() => {
    if (initialPeriod) {
      setSelectedPeriod(initialPeriod);
    }
  }, [initialPeriod]);

  const isPeriodKind = kind === 'period' || kind === 'weekly' || kind === 'biweekly' || kind === 'monthly';

  const activeKind = isPeriodKind
    ? selectedPeriod === '7d'
      ? 'weekly'
      : selectedPeriod === '14d'
        ? 'biweekly'
        : 'monthly'
    : kind;

  const displayTitle = isPeriodKind
    ? `${title.replace(/\s*\(\d+[dD]\)$/, '')} (${selectedPeriod.toUpperCase()})`
    : title;

  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [bg, setBg] = useBackground();
  const [cardBlur, setCardBlur] = useCardBlur();
  const [hidden, toggleStat] = useHidden(activeKind);
  const [bigAs, setBigAs] = useBigAs();
  const [currency, setCurrency] = useCardCurrency();
  const [photoRev, setPhotoRev] = useState(0);
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string | null>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderedVideoBlob, setRenderedVideoBlob] = useState<Blob | null>(null);
  const [renderedVideoExt, setRenderedVideoExt] = useState<'mp4' | 'webm'>('mp4');
  const [isCustomVideo, setIsCustomVideo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [muteAudio, setMuteAudio] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const hasCustomMedia = Boolean(customPhotoUrl || customVideoUrl);

  const isLoss = isProfit === false || (params ? /(?:^|&)(?:isProfit=false|outcome=loss)(?:&|$)/.test(params) : false);
  const previewBgUrl =
    bg !== CUSTOM && PREVIEW_BG[bg]
      ? cardBlur
        ? PREVIEW_BG[bg][isLoss ? 'loss' : 'profit']
        : PREVIEW_BG[bg][isLoss ? 'rawLoss' : 'rawProfit']
      : undefined;

  const clearCustomMedia = () => {
    if (customVideoUrl) {
      URL.revokeObjectURL(customVideoUrl);
      setCustomVideoUrl(null);
    }
    if (renderedVideoUrl) {
      URL.revokeObjectURL(renderedVideoUrl);
      setRenderedVideoUrl(null);
    }
    setRenderedVideoBlob(null);
    setCustomPhotoUrl(null);
    setIsCustomVideo(false);
    setMuteAudio(false);
    if (bg === CUSTOM) setBg('whale');
    setPhotoRev((r) => r + 1);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      // 1x use cleanup: revoke memory and clear ephemeral media
      clearCustomMedia();
    }
  };

  const customVideoUrlRef = useRef<string | null>(null);
  const renderedVideoUrlRef = useRef<string | null>(null);
  customVideoUrlRef.current = customVideoUrl;
  renderedVideoUrlRef.current = renderedVideoUrl;

  useEffect(() => {
    return () => {
      // Revoke ephemeral blob URLs ONLY on unmount
      if (customVideoUrlRef.current) {
        URL.revokeObjectURL(customVideoUrlRef.current);
      }
      if (renderedVideoUrlRef.current) {
        URL.revokeObjectURL(renderedVideoUrlRef.current);
      }
    };
  }, []);

  const isRenderingRef = useRef(false);

  const renderCurrentVideo = async (
    rawUrl: string,
    cardBlob: Blob,
    blur: boolean,
    mute: boolean,
  ) => {
    if (isRenderingRef.current) return;
    isRenderingRef.current = true;
    setRenderingVideo(true);
    setRenderProgress(0);
    try {
      const res = await renderCompositeVideo(rawUrl, cardBlob, blur, mute, (pct) => {
        setRenderProgress(pct);
      });
      if (renderedVideoUrl) {
        URL.revokeObjectURL(renderedVideoUrl);
      }
      const newUrl = URL.createObjectURL(res.blob);
      setRenderedVideoUrl(newUrl);
      setRenderedVideoBlob(res.blob);
      setRenderedVideoExt(res.ext);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to render video');
    } finally {
      isRenderingRef.current = false;
      setRenderingVideo(false);
    }
  };

  const upload = async (chosen: File): Promise<void> => {
    setUploading(true);
    try {
      // 1. Magic byte sniffing (defends against extension spoofing, SVG XSS, and polyglots)
      const verified = await sniffMediaSignature(chosen);

      if (customVideoUrl) {
        URL.revokeObjectURL(customVideoUrl);
        setCustomVideoUrl(null);
      }
      if (renderedVideoUrl) {
        URL.revokeObjectURL(renderedVideoUrl);
        setRenderedVideoUrl(null);
      }
      setRenderedVideoBlob(null);

      if (verified.type === 'video') {
        const MAX_VIDEO_SIZE = 15 * 1024 * 1024; // 15MB
        if (chosen.size > MAX_VIDEO_SIZE) {
          throw new Error('Video size exceeds 15MB limit.');
        }

        const videoUrl = URL.createObjectURL(chosen);
        const probe = document.createElement('video');
        probe.src = videoUrl;
        probe.preload = 'metadata';
        await new Promise<void>((resolve) => {
          probe.onloadedmetadata = () => resolve();
          probe.onerror = () => resolve();
          setTimeout(resolve, 3000);
        });

        if (Number.isFinite(probe.duration) && probe.duration > MAX_VIDEO_DURATION) {
          URL.revokeObjectURL(videoUrl);
          throw new Error(`Video duration exceeds ${MAX_VIDEO_DURATION} seconds limit.`);
        }

        setCustomVideoUrl(videoUrl);
        setCustomPhotoUrl(null);
        setIsCustomVideo(true);
      } else {
        // 2. Image processing with pixel flood (decompression bomb) and memory bounds
        const photo = await processImage(chosen);
        setCustomPhotoUrl(photo);
        setIsCustomVideo(false);
      }

      setBg(CUSTOM);
      setPhotoRev((r) => r + 1);
      toast.success(verified.type === 'video' ? 'Video background loaded.' : 'Image background loaded.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not process file');
    } finally {
      setUploading(false);
    }
  };

  const scrollThemes = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = dir === 'left' ? -180 : 180;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!open) return;
    let live = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setError(null);
    setUrl(null);
    setBlob(null);
    setCopied(false);

    const query = new URLSearchParams(params ?? '');
    query.set('bg', bg);
    query.set('blur', cardBlur ? 'true' : 'false');
    query.set('currency', currency);
    if (isPeriodKind || allowPeriodSwitch) query.set('days', selectedPeriod === '7d' ? '7' : selectedPeriod === '14d' ? '14' : '30');
    if (hidden.length) query.set('hide', hidden.join(','));
    if (BIG_KINDS.has(activeKind)) query.set('big', bigAs);

    fetch(`/api/card/${activeKind}.png?${query}`, { credentials: 'same-origin', signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Nothing to draw yet (404)' : `Render failed (${r.status})`);
        const rendered = await r.blob();
        const photo = bg === CUSTOM && !isCustomVideo ? customPhotoUrl : null;
        const b = photo ? await underlay(rendered, photo) : rendered;
        if (!live) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not render (ERR_RENDER)'));

    return () => {
      live = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, activeKind, params, bg, hidden, bigAs, currency, allowPeriodSwitch, selectedPeriod, photoRev, cardBlur, customPhotoUrl, isCustomVideo]);

  useEffect(() => {
    if (
      bg === CUSTOM &&
      isCustomVideo &&
      customVideoUrl &&
      blob &&
      !renderedVideoBlob &&
      !renderingVideo
    ) {
      void renderCurrentVideo(customVideoUrl, blob, cardBlur, muteAudio);
    }
  }, [bg, isCustomVideo, customVideoUrl, blob, renderedVideoBlob, renderingVideo, cardBlur, muteAudio]);

  const handleSave = async () => {
    if (bg === CUSTOM && isCustomVideo) {
      if (renderingVideo || !renderedVideoBlob) {
        toast.info('Rendering video in progress, please wait…');
        return;
      }
      const downloadUrl = URL.createObjectURL(renderedVideoBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `invictus-${activeKind}.${renderedVideoExt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
      toast.success(`Video exported as .${renderedVideoExt}`);
      return;
    }

    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `invictus-${activeKind}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const copy = async (): Promise<void> => {
    try {
      if (bg === CUSTOM && isCustomVideo && previewVideoRef.current) {
        const snapshot = await copyCurrentFrame(previewVideoRef.current);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': snapshot })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Video frame snapshot copied to clipboard');
        return;
      }

      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Card image copied to clipboard');
    } catch {
      toast.error('Browser does not support clipboard copy. Use Save instead.');
    }
  };

  const handleShare = async (): Promise<void> => {
    if (bg === CUSTOM && isCustomVideo) {
      if (renderingVideo || !renderedVideoBlob) {
        toast.info('Rendering video in progress, please wait…');
        return;
      }
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        try {
          const fileObj = new File([renderedVideoBlob], `invictus-${activeKind}.${renderedVideoExt}`, {
            type: renderedVideoBlob.type,
          });
          await navigator.share({
            files: [fileObj],
            title: displayTitle,
          });
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
        }
      }
      // Fallback: download
      const downloadUrl = URL.createObjectURL(renderedVideoBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `invictus-${activeKind}.${renderedVideoExt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
      toast.success(`Video exported as .${renderedVideoExt}`);
      return;
    }

    if (!blob) return;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        const fileObj = new File([blob], `invictus-${activeKind}.png`, { type: 'image/png' });
        await navigator.share({
          files: [fileObj],
          title: displayTitle,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          void copy();
        }
      }
    } else {
      void copy();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={cn('cursor-pointer gap-1.5', className)}>
          <ImageIcon className="size-3.5 shrink-0" />
          <span>{label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[92vh] flex flex-col gap-4 p-5 overflow-y-auto bg-popover text-popover-foreground border border-border/80 shadow-2xl">
        <DialogHeader className="flex flex-row items-center justify-between gap-3 pr-8 pb-1 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
              <ImageIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground flex items-center gap-2">
                <span>{displayTitle}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground font-mono truncate">
                Share or export performance card
              </DialogDescription>
            </div>
          </div>
          {allowPeriodSwitch && (
            <Tabs
              value={selectedPeriod}
              onValueChange={(v) => setSelectedPeriod(v as '7d' | '14d' | '30d')}
              className="shrink-0"
            >
              <TabsList className="h-7 bg-muted/50 border border-border/60 p-0.5 rounded-lg">
                {(['7d', '14d', '30d'] as const).map((p) => (
                  <TabsTrigger
                    key={p}
                    value={p}
                    className="text-xs px-2.5 h-6 font-mono font-medium rounded-md text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all uppercase"
                  >
                    {p}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </DialogHeader>

        {/* Card Preview: 16:9 Aspect Ratio */}
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-card/60 shadow-lg ring-1 ring-border/40">
          {/* Active Background Element (Video, Image, or Preset) */}
          {bg === CUSTOM && isCustomVideo && renderedVideoUrl ? (
            <video
              ref={previewVideoRef}
              src={renderedVideoUrl}
              controls
              autoPlay
              loop
              muted={muteAudio}
              playsInline
              className="absolute inset-0 h-full w-full object-cover z-10"
            />
          ) : bg === CUSTOM && isCustomVideo && customVideoUrl ? (
            <>
              <video
                src={customVideoUrl}
                autoPlay
                loop
                muted
                playsInline
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-all duration-300',
                  cardBlur && 'filter blur-[2.5px] scale-105',
                )}
              />
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[0.5px] z-[5] pointer-events-none" />
              {url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={url}
                  alt={displayTitle}
                  className="absolute inset-0 z-10 h-full w-full object-cover select-none pointer-events-none"
                />
              )}
              {renderingVideo && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-xs gap-2">
                  <Loader2 className="size-6 animate-spin text-foreground" />
                  <div className="text-xs font-mono font-semibold text-foreground">
                    Rendering Video… {renderProgress}%
                  </div>
                  <div className="w-44 h-1.5 bg-muted/60 rounded-full overflow-hidden border border-border/50">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-150"
                      style={{ width: `${renderProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">Baking PnL overlay & audio</span>
                </div>
              )}
            </>
          ) : bg === CUSTOM && customPhotoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={customPhotoUrl}
              alt="Custom background"
              className={cn(
                'absolute inset-0 h-full w-full object-cover transition-all duration-300',
                cardBlur && 'filter blur-[2.5px] scale-105',
              )}
            />
          ) : previewBgUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewBgUrl}
              alt="Background preview"
              className={cn(
                'absolute inset-0 h-full w-full object-cover transition-all duration-300',
                cardBlur && 'filter blur-[2px] scale-105',
              )}
            />
          ) : null}

          {/* Full-coverage ambient backdrop overlay (only for non-renderedVideo modes) */}
          {(!isCustomVideo || !renderedVideoUrl) && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[0.5px] z-[5]" />
          )}

          {(!isCustomVideo || !renderedVideoUrl) && (
            error ? (
              <p className="relative z-10 text-xs text-destructive px-4 py-2 text-center select-none bg-card/90 rounded-md border border-destructive/30">
                {error}
              </p>
            ) : url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={url}
                alt={displayTitle}
                className="absolute inset-0 z-10 h-full w-full object-cover select-none pointer-events-none"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 relative z-10">
                <Loader2 className="text-muted-foreground size-5 animate-spin" />
                <span className="text-xs text-muted-foreground font-mono">Rendering card…</span>
              </div>
            )
          )}
        </div>

        {/* Background Carousel */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground tracking-wider uppercase">BACKGROUND</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollThemes('left')}
                aria-label="Previous backgrounds"
                className="size-6 flex items-center justify-center rounded-md border border-border/60 bg-card/40 hover:bg-muted/60 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollThemes('right')}
                aria-label="Next backgrounds"
                className="size-6 flex items-center justify-center rounded-md border border-border/60 bg-card/40 hover:bg-muted/60 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none snap-x"
          >
            {BACKGROUNDS.map((b) => {
              const bgEntry = PREVIEW_BG[b.key];
              const bgPath = bgEntry
                ? cardBlur
                  ? bgEntry[isLoss ? 'loss' : 'profit']
                  : bgEntry[isLoss ? 'rawLoss' : 'rawProfit']
                : undefined;
              const isSelected = bg === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBg(b.key)}
                  className={cn(
                    'relative shrink-0 w-24 aspect-video rounded-lg overflow-hidden border transition-all cursor-pointer group text-left',
                    isSelected
                      ? 'border-primary ring-1 ring-primary/40 scale-[1.02] shadow-xs'
                      : 'border-border/60 opacity-60 hover:opacity-100 hover:border-border',
                  )}
                >
                  {bgPath && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={bgPath}
                      alt={b.label}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  <span className="absolute bottom-1 left-1.5 text-[10px] font-medium text-zinc-100 tracking-wide">
                    {b.label}
                  </span>
                  {isSelected && (
                    <div className="absolute top-1 right-1 size-3.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                      <Check className="size-2.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}

            {/* Custom Media Thumbnail if available (1x use) */}
            {hasCustomMedia && (
              <div
                className={cn(
                  'relative shrink-0 w-24 aspect-video rounded-lg overflow-hidden border transition-all group',
                  bg === CUSTOM
                    ? 'border-primary ring-1 ring-primary/40 scale-[1.02] shadow-xs'
                    : 'border-border/60 opacity-60 hover:opacity-100 hover:border-border',
                )}
              >
                <button
                  type="button"
                  onClick={() => setBg(CUSTOM)}
                  className="absolute inset-0 h-full w-full cursor-pointer text-left"
                >
                  {isCustomVideo && customVideoUrl ? (
                    <video
                      src={customVideoUrl}
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : customPhotoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={customPhotoUrl}
                      alt="Custom 1x"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-muted/30 flex items-center justify-center">
                      <ImageIcon className="size-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  <span className="absolute bottom-1 left-1.5 text-[10px] font-medium text-zinc-100 flex items-center gap-1">
                    {isCustomVideo ? <Video className="size-2.5" /> : null}
                    <span>{isCustomVideo ? 'Video' : 'Media'}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Remove custom media"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearCustomMedia();
                  }}
                  className="absolute top-1 right-1 size-4 rounded-full bg-background/80 hover:bg-destructive text-foreground hover:text-destructive-foreground flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            )}

            {/* Upload Button Tile (Images & Videos) */}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.mp4,.webm,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                e.target.value = '';
                if (chosen) void upload(chosen);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => file.current?.click()}
              className="shrink-0 w-24 aspect-video rounded-lg border border-dashed border-border/70 hover:border-foreground/40 bg-card/40 hover:bg-muted/40 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isCustomVideo ? (
                <Video className="size-3.5" />
              ) : (
                <Upload className="size-3.5" />
              )}
              <span className="text-[10px] font-medium font-mono">
                {uploading ? 'Processing…' : hasCustomMedia ? 'Replace' : 'Upload'}
              </span>
            </button>
          </div>
        </div>

        {/* Formatting & Controls: Balanced Grid Layout */}
        <div className="space-y-3 pt-1.5 border-t border-border/60">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {/* Currency Selector */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Currency</span>
              <div className="flex h-7 overflow-hidden rounded-lg border border-border/60 bg-muted/40 p-0.5">
                {(['usd', 'idr'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={currency === c}
                    onClick={() => setCurrency(c)}
                    className={cn(
                      'h-6 flex-1 items-center justify-center font-mono text-xs font-semibold rounded-md transition-all cursor-pointer uppercase',
                      currency === c
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Display Metric Selector */}
            {BIG_KINDS.has(activeKind) ? (
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Metric</span>
                <div className="flex h-7 overflow-hidden rounded-lg border border-border/60 bg-muted/40 p-0.5">
                  {(['usd', 'pct'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={bigAs === v}
                      onClick={() => setBigAs(v)}
                      className={cn(
                        'h-6 flex-1 items-center justify-center font-mono text-xs font-semibold rounded-md transition-all cursor-pointer',
                        bigAs === v
                          ? 'bg-background text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                      )}
                    >
                      {v === 'usd' ? '$ Value' : '% ROI'}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Blur Effect Option */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Background Blur</span>
              <div className="flex h-7 overflow-hidden rounded-lg border border-border/60 bg-muted/40 p-0.5">
                <button
                  type="button"
                  aria-pressed={cardBlur}
                  onClick={() => {
                    setCardBlur(true);
                    if (isCustomVideo && customVideoUrl && blob) {
                      void renderCurrentVideo(customVideoUrl, blob, true, muteAudio);
                    }
                  }}
                  className={cn(
                    'h-6 flex-1 items-center justify-center font-mono text-xs font-semibold rounded-md transition-all cursor-pointer',
                    cardBlur
                      ? 'bg-background text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                  )}
                >
                  Blur
                </button>
                <button
                  type="button"
                  aria-pressed={!cardBlur}
                  onClick={() => {
                    setCardBlur(false);
                    if (isCustomVideo && customVideoUrl && blob) {
                      void renderCurrentVideo(customVideoUrl, blob, false, muteAudio);
                    }
                  }}
                  className={cn(
                    'h-6 flex-1 items-center justify-center font-mono text-xs font-semibold rounded-md transition-all cursor-pointer',
                    !cardBlur
                      ? 'bg-background text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                  )}
                >
                  Sharp
                </button>
              </div>
            </div>

            {/* Audio Option (Preserve Original Sound vs Mute) */}
            {bg === CUSTOM && isCustomVideo && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Sound</span>
                  {renderedVideoBlob && !renderingVideo && (
                    <button
                      type="button"
                      onClick={() => {
                        if (customVideoUrl && blob) {
                          void renderCurrentVideo(customVideoUrl, blob, cardBlur, muteAudio);
                        }
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                    >
                      Re-render
                    </button>
                  )}
                </div>
                <div className="flex h-7 overflow-hidden rounded-lg border border-border/60 bg-muted/40 p-0.5">
                  <button
                    type="button"
                    aria-pressed={!muteAudio}
                    onClick={() => {
                      setMuteAudio(false);
                      if (previewVideoRef.current) previewVideoRef.current.muted = false;
                      if (customVideoUrl && blob) {
                        void renderCurrentVideo(customVideoUrl, blob, cardBlur, false);
                      }
                    }}
                    className={cn(
                      'h-6 flex-1 items-center justify-center font-mono text-xs font-semibold rounded-md transition-all cursor-pointer',
                      !muteAudio
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                    )}
                  >
                    Audio
                  </button>
                  <button
                    type="button"
                    aria-pressed={muteAudio}
                    onClick={() => {
                      setMuteAudio(true);
                      if (previewVideoRef.current) previewVideoRef.current.muted = true;
                      if (customVideoUrl && blob) {
                        void renderCurrentVideo(customVideoUrl, blob, cardBlur, true);
                      }
                    }}
                    className={cn(
                      'h-6 flex-1 items-center justify-center font-mono text-xs font-semibold rounded-md transition-all cursor-pointer',
                      muteAudio
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                    )}
                  >
                    Mute
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Visible Metrics Pills */}
          {(STATS[activeKind] ?? []).length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Visible Metrics</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {[...(STATS[activeKind] ?? []), 'REFERRAL'].map((lbl) => {
                  const on = !hidden.includes(lbl);
                  return (
                    <button
                      key={lbl}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleStat(lbl)}
                      className={cn(
                        'h-6 inline-flex items-center rounded-md border px-2 text-[11px] font-mono font-medium transition-all cursor-pointer',
                        on
                          ? 'border-border/80 bg-card text-foreground shadow-2xs'
                          : 'border-border/30 bg-muted/20 text-muted-foreground/45 hover:text-muted-foreground hover:border-border/60',
                      )}
                    >
                      <span>{toInitialCap(lbl)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons: 3-column Grid matching Design System */}
        <div className="pt-2 border-t border-border/60 shrink-0">
          <div className="grid grid-cols-3 gap-2.5 w-full">
            <Button
              variant="outline"
              size="default"
              disabled={(!blob && !renderedVideoBlob) || renderingVideo}
              onClick={() => void handleShare()}
              className="h-10 cursor-pointer font-medium text-xs sm:text-sm border-border/80 bg-card/40 hover:bg-muted/60 text-foreground transition-colors"
            >
              <Share2 className="size-4 mr-1.5 shrink-0 text-muted-foreground" />
              <span>Share</span>
            </Button>

            <Button
              variant="outline"
              size="default"
              disabled={(!blob && !renderedVideoBlob) || renderingVideo}
              onClick={() => void copy()}
              className="h-10 cursor-pointer font-medium text-xs sm:text-sm border-border/80 bg-card/40 hover:bg-muted/60 text-foreground transition-colors"
            >
              {copied ? (
                <>
                  <Check className="size-4 mr-1.5 shrink-0 text-up" />
                  <span className="text-up font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-1.5 shrink-0 text-muted-foreground" />
                  <span>{bg === CUSTOM && isCustomVideo ? 'Copy Frame' : 'Copy Image'}</span>
                </>
              )}
            </Button>

            <Button
              size="default"
              disabled={bg === CUSTOM && isCustomVideo ? (!renderedVideoBlob || renderingVideo) : !url}
              onClick={() => void handleSave()}
              className="h-10 cursor-pointer font-semibold text-xs sm:text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              {renderingVideo ? (
                <>
                  <Loader2 className="size-4 mr-1.5 shrink-0 animate-spin text-primary-foreground" />
                  <span>{renderProgress > 0 ? `${renderProgress}%` : 'Rendering…'}</span>
                </>
              ) : bg === CUSTOM && isCustomVideo ? (
                <>
                  <Video className="size-4 mr-1.5 shrink-0 text-primary-foreground" />
                  <span>Save Video</span>
                </>
              ) : (
                <>
                  <Download className="size-4 mr-1.5 shrink-0 text-primary-foreground" />
                  <span>Save PNG</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
