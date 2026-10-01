import { useCallback, useEffect, useRef, useState } from 'react';
import { CAPTURE_FPS, FrameBuffer, type CapturedFrame } from '@/lib/frameBuffer';
import { loadFrameImage } from '@/lib/frameImage';

export type Resolution = '720p' | '1080p';
type FacingMode = 'user' | 'environment';

function cameraError(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow camera access in browser settings, then retry. In Lovable, try opening the preview in a new tab.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'The requested camera is unavailable. Try another camera or lower resolution.';
  if (name === 'NotReadableError') return 'The camera could not start. Close other apps using it and retry.';
  return error instanceof Error ? error.message : 'The camera could not start. Please retry.';
}

export function useDelayedCamera(delaySeconds: number, bufferSeconds: number) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [resolution, setResolution] = useState<Resolution>('720p');
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasDelayedFrame, setHasDelayedFrame] = useState(false);
  const [stats, setStats] = useState({ frames: 0, seconds: 0, megabytes: 0 });
  const [actualResolution, setActualResolution] = useState('');
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const delayedCanvasRef = useRef<HTMLCanvasElement>(null);
  const [buffer] = useState(() => new FrameBuffer());
  const bufferRef = useRef(buffer);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const activeRef = useRef(false);
  const pausedRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(false);
  const optionsRef = useRef({ delaySeconds, bufferSeconds, resolution, facingMode });
  optionsRef.current = { delaySeconds, bufferSeconds, resolution, facingMode };

  const clearDisplay = useCallback(() => {
    bufferRef.current.clear();
    setHasDelayedFrame(false);
    setStats({ frames: 0, seconds: 0, megabytes: 0 });
    const canvas = delayedCanvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const releaseCamera = useCallback(() => {
    generationRef.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    streamRef.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    captureCanvasRef.current = null;
    activeRef.current = startingRef.current = pausedRef.current = false;
  }, []);

  const stopStream = useCallback(() => {
    releaseCamera();
    clearDisplay();
    setIsStreaming(false);
    setIsStarting(false);
    setIsPaused(false);
    setActualResolution('');
  }, [releaseCamera, clearDisplay]);

  const runCapture = useCallback((generation: number) => {
    const capture = async () => {
      const valid = () => mountedRef.current && generation === generationRef.current && activeRef.current && !pausedRef.current;
      if (!valid()) return;
      const start = performance.now();
      const video = liveVideoRef.current;
      const canvas = captureCanvasRef.current;
      try {
        if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
          const maxEdge = optionsRef.current.resolution === '1080p' ? 1920 : 1280;
          const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
          const width = Math.round(video.videoWidth * scale);
          const height = Math.round(video.videoHeight * scale);
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            // Geometry changes (including orientation) must not mix dimensions in an export.
            clearDisplay();
            setActualResolution(`${width} × ${height}`);
          }
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('This browser cannot capture camera frames');
          ctx.drawImage(video, 0, 0, width, height);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
          if (!valid()) return;
          if (!blob) throw new Error('The browser could not capture a camera frame');
          bufferRef.current.push({ blob, timestamp: start }, optionsRef.current.bufferSeconds);
          const frame = bufferRef.current.atTime(performance.now() - optionsRef.current.delaySeconds * 1000);
          if (frame) {
            const image = await loadFrameImage(frame.blob);
            try {
              if (!valid()) return;
              const output = delayedCanvasRef.current;
              if (output) {
                if (output.width !== image.width || output.height !== image.height) {
                  output.width = image.width;
                  output.height = image.height;
                }
                output.getContext('2d')?.drawImage(image.source, 0, 0);
                setHasDelayedFrame(true);
              }
            } finally { image.close(); }
          } else { setHasDelayedFrame(false); }
        }
      } catch (error) {
        if (valid()) { stopStream(); setErrorMessage(cameraError(error)); }
        return;
      }
      // Only one JPEG encode/decode is in flight; slow devices drop FPS instead of
      // accumulating an async queue. Delay still uses elapsed time, not frame count.
      if (valid()) timerRef.current = setTimeout(capture, Math.max(0, 1000 / CAPTURE_FPS - (performance.now() - start)));
    };
    void capture();
  }, [clearDisplay, stopStream]);

  const startStream = useCallback(async (next?: { resolution: Resolution; facingMode: FacingMode }) => {
    if (startingRef.current) return;
    const settings = next ?? optionsRef.current;
    releaseCamera();
    clearDisplay();
    startingRef.current = true;
    const generation = generationRef.current;
    const valid = () => mountedRef.current && generation === generationRef.current;
    setIsStarting(true);
    setIsStreaming(false);
    setIsPaused(false);
    setErrorMessage('');
    let stream: MediaStream | undefined;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires HTTPS or localhost and a supported browser. Open the published app or Lovable preview in a new tab.');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: settings.facingMode },
          width: { ideal: settings.resolution === '1080p' ? 1920 : 1280 },
          height: { ideal: settings.resolution === '1080p' ? 1080 : 720 },
          frameRate: { ideal: CAPTURE_FPS },
        }, audio: false,
      });
      if (!valid()) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = liveVideoRef.current;
      if (!video) throw new Error('Camera preview is unavailable');
      video.srcObject = stream;
      await video.play();
      if (!valid()) { stream.getTracks().forEach(track => track.stop()); return; }
      setResolution(settings.resolution);
      setFacingMode(settings.facingMode);
      optionsRef.current = { ...optionsRef.current, ...settings };
      captureCanvasRef.current = document.createElement('canvas');
      const size = stream.getVideoTracks()[0]?.getSettings();
      setActualResolution(size?.width && size?.height ? `${size.width} × ${size.height}` : '');
      stream.getVideoTracks().forEach(track => {
        track.onended = () => { if (mountedRef.current && streamRef.current === stream) { stopStream(); setErrorMessage('The camera disconnected. Please retry.'); } };
      });
      activeRef.current = true;
      setIsStreaming(true);
      runCapture(generation);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (valid()) { stopStream(); setErrorMessage(cameraError(error)); }
    } finally {
      if (valid()) { startingRef.current = false; setIsStarting(false); }
    }
  }, [releaseCamera, clearDisplay, runCapture, stopStream]);

  const pauseStream = useCallback(() => {
    if (!activeRef.current || pausedRef.current) return;
    pausedRef.current = true;
    generationRef.current++; // discard late toBlob/decode completions
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(track => { track.enabled = false; });
    setIsPaused(true);
  }, []);

  const resumeStream = useCallback(() => {
    if (!activeRef.current || !pausedRef.current) return;
    clearDisplay(); // no pre-pause frames labelled as a new live delay
    pausedRef.current = false;
    streamRef.current?.getTracks().forEach(track => { track.enabled = true; });
    setIsPaused(false);
    runCapture(generationRef.current);
  }, [clearDisplay, runCapture]);

  const changeResolution = (value: Resolution) => {
    if (value === resolution || startingRef.current) return;
    if (activeRef.current) void startStream({ resolution: value, facingMode });
    else setResolution(value);
  };
  const switchCamera = () => {
    if (startingRef.current) return;
    const value = facingMode === 'user' ? 'environment' : 'user';
    if (activeRef.current) void startStream({ resolution, facingMode: value });
    else setFacingMode(value);
  };

  const getFramesForExport = (): CapturedFrame[] => {
    pauseStream(); // one bounded buffer, rather than keeping two full buffers alive
    return bufferRef.current.snapshot();
  };

  useEffect(() => {
    bufferRef.current.trim(bufferSeconds, pausedRef.current ? bufferRef.current.latestTimestamp : performance.now());
    if (!pausedRef.current) setHasDelayedFrame(false);
  }, [bufferSeconds, delaySeconds]);

  useEffect(() => {
    mountedRef.current = true;
    const currentBuffer = bufferRef.current;
    const tick = setInterval(() => {
      const buffer = bufferRef.current;
      setStats(current => current.frames === buffer.length && current.seconds === buffer.durationSeconds && current.megabytes === buffer.bytes / (1024 * 1024)
        ? current : { frames: buffer.length, seconds: buffer.durationSeconds, megabytes: buffer.bytes / (1024 * 1024) });
    }, 500);
    const hidden = () => { if (document.hidden) { if (startingRef.current) stopStream(); else pauseStream(); } };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', stopStream);
    return () => {
      mountedRef.current = false;
      clearInterval(tick);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', stopStream);
      releaseCamera();
      currentBuffer.clear();
    };
  }, [pauseStream, releaseCamera, stopStream]);

  return { isStreaming, isStarting, isPaused, resolution, facingMode, errorMessage, hasDelayedFrame, stats, actualResolution,
    liveVideoRef, delayedCanvasRef, startStream, stopStream, pauseStream, resumeStream, changeResolution, switchCamera, getFramesForExport };
}
