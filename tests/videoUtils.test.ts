import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getResolvedFormat, getSupportedCodecs, saveFramesAsVideo } from '../src/lib/videoUtils';
import { loadFrameImage } from '../src/lib/frameImage';

vi.mock('../src/lib/frameImage', () => ({ loadFrameImage: vi.fn() }));
const image = () => ({ source: {} as CanvasImageSource, width: 1280, height: 720, close: vi.fn() });
const frame = (timestamp: number) => ({ timestamp, blob: new Blob(['jpeg']) });
let recorder: FakeRecorder;
let stopTrack: ReturnType<typeof vi.fn>;
let draw: ReturnType<typeof vi.fn>;
let download: ReturnType<typeof vi.fn>;

function captureRecorder(value: FakeRecorder) { recorder = value; }

class FakeRecorder {
  static isTypeSupported = (mime: string) => mime.includes('webm');
  mimeType: string;
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, options: MediaRecorderOptions) { this.mimeType = options.mimeType!; captureRecorder(this); }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['video']) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  FakeRecorder.isTypeSupported = mime => mime.includes('webm');
  stopTrack = vi.fn();
  draw = vi.fn();
  download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ({ getTracks: () => [{ stop: stopTrack }] }) });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.mocked(loadFrameImage).mockImplementation(async () => image());
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('format selection', () => {
  it('reports unsupported export without inventing a format', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(getResolvedFormat()).toBeUndefined();
    expect(getSupportedCodecs().every(c => !c.supported)).toBe(true);
  });
  it('uses supported fallback and respects a partial selection', () => {
    expect(getResolvedFormat('av1', 'mp4')?.container).toBe('webm');
    expect(getResolvedFormat('vp8', 'auto')?.codec).toBe('vp8');
    FakeRecorder.isTypeSupported = mime => mime.includes('avc1') || mime.includes('vp9');
    expect(getResolvedFormat('auto', 'webm')?.codec).toBe('vp9');
    expect(getResolvedFormat()?.codec).toBe('h264');
  });
});

describe('export lifecycle', () => {
  it('retains single-frame duration and uses the actual recorder container', async () => {
    const pending = saveFramesAsVideo({ frames: [frame(100)], filename: 'clip.mp4' });
    await vi.advanceTimersByTimeAsync(150);
    expect(await pending).toMatchObject({ container: 'webm', filename: 'clip.webm' });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('preserves elapsed timestamps instead of treating missing frames as 10 fps', async () => {
    const pending = saveFramesAsVideo({ frames: [frame(0), frame(100), frame(400)], filename: 'clip' });
    await vi.advanceTimersByTimeAsync(110);
    expect(draw).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(280);
    expect(draw).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120);
    await pending;
    expect(draw).toHaveBeenCalledTimes(3);
  });

  it('cancels promptly, stops tracks, and does not download', async () => {
    const controller = new AbortController();
    const pending = saveFramesAsVideo({ frames: [frame(0), frame(5000)], filename: 'clip', signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    expect(recorder.state).toBe('inactive');
  });

  it('releases recorder and tracks after a frame decode failure', async () => {
    vi.mocked(loadFrameImage).mockResolvedValueOnce(image()).mockRejectedValueOnce(new Error('bad jpeg'));
    await expect(saveFramesAsVideo({ frames: [frame(0), frame(100)], filename: 'clip' })).rejects.toThrow('bad jpeg');
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(recorder.state).toBe('inactive');
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects encoder errors during a long export without waiting for the whole clip', async () => {
    const pending = saveFramesAsVideo({ frames: [frame(0), frame(5000)], filename: 'clip' });
    const rejected = expect(pending).rejects.toThrow('video encoder failed');
    await vi.advanceTimersByTimeAsync(0);
    recorder.onerror?.();
    await rejected;
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it('releases stream tracks even when recorder teardown itself throws', async () => {
    vi.mocked(loadFrameImage).mockResolvedValueOnce(image()).mockRejectedValueOnce(new Error('bad jpeg'));
    vi.spyOn(FakeRecorder.prototype, 'stop').mockImplementation(() => { throw new Error('teardown failed'); });
    await expect(saveFramesAsVideo({ frames: [frame(0), frame(100)], filename: 'clip' })).rejects.toThrow('teardown failed');
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it('times out when the browser never fires onstop', async () => {
    vi.spyOn(FakeRecorder.prototype, 'stop').mockImplementation(function () { this.state = 'inactive'; });
    const pending = saveFramesAsVideo({ frames: [frame(0)], filename: 'clip' });
    const rejected = expect(pending).rejects.toThrow('did not finish');
    await vi.advanceTimersByTimeAsync(10_200);
    await rejected;
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
