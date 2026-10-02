export interface FrameImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/** Keep just the displayed/encoded image decoded, even for a long JPEG buffer. */
async function decodeFrame(blob: Blob): Promise<FrameImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not decode a captured frame'));
      image.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; } };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Cancel the wait promptly; a bitmap that finishes later is closed immediately. */
export function loadFrameImage(blob: Blob, signal?: AbortSignal): Promise<FrameImage> {
  const abortError = () => new DOMException('Frame decode cancelled', 'AbortError');
  if (signal?.aborted) return Promise.reject(abortError());
  const decoding = decodeFrame(blob);
  if (!signal) return decoding;
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { settled = true; signal.removeEventListener('abort', abort); reject(abortError()); };
    signal.addEventListener('abort', abort, { once: true });
    decoding.then(image => {
      signal.removeEventListener('abort', abort);
      if (settled) image.close();
      else { settled = true; resolve(image); }
    }, error => {
      signal.removeEventListener('abort', abort);
      if (!settled) { settled = true; reject(error); }
    });
  });
}
