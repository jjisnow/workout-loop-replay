import { CAPTURE_FPS, type CapturedFrame } from './frameBuffer';
import { loadFrameImage } from './frameImage';

export type VideoCodec = 'av1' | 'hevc' | 'h264' | 'vp9' | 'vp8' | 'auto';
export type VideoContainer = 'mp4' | 'mkv' | 'webm' | 'auto';
export interface VideoFormat {
  codec: Exclude<VideoCodec, 'auto'> | 'unknown';
  container: Exclude<VideoContainer, 'auto'>;
  mimeType: string;
  displayName: string;
}

// One table drives detection, selection, labels and the actual encoder. Prefer
// widely playable formats for Auto; codec support never implies hardware encoding.
const FORMATS: Array<Omit<VideoFormat, 'displayName'>> = [
  { codec: 'h264', container: 'mp4', mimeType: 'video/mp4;codecs=avc1.42E01E' },
  { codec: 'h264', container: 'mp4', mimeType: 'video/mp4;codecs=avc1' },
  { codec: 'vp9', container: 'webm', mimeType: 'video/webm;codecs=vp9' },
  { codec: 'vp8', container: 'webm', mimeType: 'video/webm;codecs=vp8' },
  { codec: 'hevc', container: 'mp4', mimeType: 'video/mp4;codecs=hvc1.1.6.L93.B0' },
  { codec: 'hevc', container: 'mp4', mimeType: 'video/mp4;codecs=hev1.1.6.L93.B0' },
  { codec: 'av1', container: 'mp4', mimeType: 'video/mp4;codecs=av01.0.05M.08' },
  { codec: 'av1', container: 'webm', mimeType: 'video/webm;codecs=av01.0.05M.08' },
  { codec: 'av1', container: 'webm', mimeType: 'video/webm;codecs=av01' },
  { codec: 'vp9', container: 'mp4', mimeType: 'video/mp4;codecs=vp09.00.10.08' },
  { codec: 'h264', container: 'mkv', mimeType: 'video/x-matroska;codecs=avc1.42E01E' },
  { codec: 'vp9', container: 'mkv', mimeType: 'video/x-matroska;codecs=vp9' },
  { codec: 'hevc', container: 'mkv', mimeType: 'video/x-matroska;codecs=hev1.1.6.L93.B0' },
  { codec: 'av1', container: 'mkv', mimeType: 'video/x-matroska;codecs=av01.0.05M.08' },
  { codec: 'unknown', container: 'mp4', mimeType: 'video/mp4' },
  { codec: 'unknown', container: 'webm', mimeType: 'video/webm' },
];

const CODEC_LABELS = { auto: 'Auto', h264: 'H.264', hevc: 'HEVC', av1: 'AV1', vp9: 'VP9', vp8: 'VP8', unknown: 'Browser default' };

function supported(mime: string) {
  try { return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime); }
  catch { return false; }
}

export function getResolvedFormat(codec: VideoCodec = 'auto', container: VideoContainer = 'auto'): VideoFormat | undefined {
  const formats = FORMATS.filter(format => supported(format.mimeType));
  const format = formats.find(f => (codec === 'auto' || f.codec === codec) && (container === 'auto' || f.container === container))
    ?? formats.find(f => container !== 'auto' && f.container === container)
    ?? formats.find(f => codec !== 'auto' && f.codec === codec)
    ?? formats[0];
  return format && { ...format, displayName: `${CODEC_LABELS[format.codec]} (${format.container.toUpperCase()})` };
}

export function getVideoCodecInfo(codec: VideoCodec = 'auto', container: VideoContainer = 'auto') {
  return getResolvedFormat(codec, container)?.displayName ?? 'Video export unavailable';
}

export function getSupportedCodecs() {
  return (['h264', 'vp9', 'vp8', 'hevc', 'av1'] as const).map(value => ({
    value, label: CODEC_LABELS[value], supported: FORMATS.some(f => f.codec === value && supported(f.mimeType)),
  }));
}

export interface VideoSaveOptions {
  frames: readonly CapturedFrame[];
  filename: string;
  codec?: VideoCodec;
  container?: VideoContainer;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}
export interface VideoSaveResult { codec: string; container: string; filename: string }

function abortError() { return new DOMException('Export cancelled', 'AbortError'); }
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }

function wait(ms: number, signal?: AbortSignal) {
  checkAbort(signal);
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, Math.max(0, ms));
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function actualFormat(mimeType: string, requested: VideoFormat): VideoFormat {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  const container = base === 'video/mp4' ? 'mp4' : base === 'video/webm' ? 'webm' : base === 'video/x-matroska' ? 'mkv' : undefined;
  if (!container) throw new Error(`Unsupported output type: ${mimeType || 'empty'}`);
  const codec = /avc1|h264/i.test(mimeType) ? 'h264' : /hvc1|hev1|hevc/i.test(mimeType) ? 'hevc'
    : /av01|av1/i.test(mimeType) ? 'av1' : /vp09|vp9/i.test(mimeType) ? 'vp9' : /vp8/i.test(mimeType) ? 'vp8'
    : mimeType === requested.mimeType ? requested.codec : 'unknown';
  return { codec, container, mimeType, displayName: `${CODEC_LABELS[codec]} (${container.toUpperCase()})` };
}

/** Canvas export runs in real time; preserve timestamps instead of stretching
 * each image-decode delay into the exported clip. Pause capture before calling. */
export async function saveFramesAsVideo({ frames, filename, codec = 'auto', container = 'auto', signal: callerSignal, onProgress }: VideoSaveOptions): Promise<VideoSaveResult> {
  if (!frames.length) throw new Error('No frames to save');
  if (frames.some((f, i) => !Number.isFinite(f.timestamp) || (i > 0 && f.timestamp <= frames[i - 1].timestamp))) {
    throw new Error('Captured frame timestamps must increase');
  }
  const controller = new AbortController();
  const signal = controller.signal;
  const relayAbort = () => controller.abort();
  checkAbort(callerSignal);
  const format = getResolvedFormat(codec, container);
  if (!format) throw new Error('This browser does not support video export');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.captureStream) throw new Error('Canvas video export is unavailable in this browser');
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  const chunks: Blob[] = [];
  let failure: Error | undefined;
  let rejectFinished: (error: Error) => void = () => undefined;
  const fail = (message: string) => { failure = new Error(message); rejectFinished(failure); controller.abort(); };
  // Abort also stops the recorder while an image decode is pending.
  const abort = () => {
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); }
    catch { /* Some browser encoders throw during teardown; finally still releases tracks. */ }
  };
  callerSignal?.addEventListener('abort', relayAbort, { once: true });
  try {
    checkAbort(callerSignal);
    const first = await loadFrameImage(frames[0].blob, signal);
    try {
      checkAbort(signal);
      canvas.width = first.width;
      canvas.height = first.height;
      ctx.drawImage(first.source, 0, 0);
    } finally { first.close(); }
    stream = canvas.captureStream(CAPTURE_FPS);
    recorder = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: 5_000_000 });
    const output = actualFormat(recorder.mimeType, format);
    const activeRecorder = recorder;
    const finished = new Promise<void>((resolve, reject) => {
      rejectFinished = reject;
      activeRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      activeRecorder.onstop = () => { if (stopTimer) clearTimeout(stopTimer); resolve(); };
      activeRecorder.onerror = () => fail('The browser video encoder failed');
    });
    // Attach immediately so an early encoder failure cannot become an unhandled rejection.
    void finished.catch(() => undefined);
    signal?.addEventListener('abort', abort, { once: true });
    checkAbort(signal);
    recorder.start(1000);
    const start = performance.now();
    const firstTimestamp = frames[0].timestamp;
    for (let i = 1; i < frames.length; i++) {
      checkAbort(signal);
      if (recorder.state === 'inactive') throw new Error('Video encoding stopped unexpectedly');
      const image = await loadFrameImage(frames[i].blob, signal);
      try {
        await wait(frames[i].timestamp - firstTimestamp - (performance.now() - start), signal);
        checkAbort(signal);
        ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
      } finally { image.close(); }
      onProgress?.(i / frames.length);
    }
    await wait(1000 / CAPTURE_FPS, signal); // retain the last frame, including single-frame exports
    checkAbort(signal);
    stopTimer = setTimeout(() => fail('The browser video encoder did not finish'), 10_000);
    if (recorder.state !== 'inactive') recorder.stop();
    await finished;
    checkAbort(signal);
    if (!chunks.length) throw new Error('The browser produced an empty video');
    const blob = new Blob(chunks, { type: output.mimeType });
    const url = URL.createObjectURL(blob);
    const name = `${filename.replace(/\.[^/.]+$/, '')}.${output.container}`;
    const link = document.createElement('a');
    try {
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      // Immediate revocation can race the download in mobile browsers.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    onProgress?.(1);
    return { codec: output.codec, container: output.container, filename: name };
  } catch (error) {
    throw failure ?? error;
  } finally {
    callerSignal?.removeEventListener('abort', relayAbort);
    if (stopTimer) clearTimeout(stopTimer);
    signal?.removeEventListener('abort', abort);
    try {
      if (recorder) {
        recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
    } finally {
      stream?.getTracks().forEach(track => track.stop());
      chunks.length = 0;
      canvas.width = canvas.height = 0;
    }
  }
}
