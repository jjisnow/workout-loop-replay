import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedCamera } from '../src/hooks/useDelayedCamera';

let camera: ReturnType<typeof useDelayedCamera>;
let getUserMedia: ReturnType<typeof vi.fn>;
function Harness({ delay = 1, buffer = 2 }: { delay?: number; buffer?: number }) {
  camera = useDelayedCamera(delay, buffer);
  return <><video ref={camera.liveVideoRef} /><canvas ref={camera.delayedCanvasRef} /></>;
}
function stream() {
  const track = { stop: vi.fn(), enabled: true, onended: null as (() => void) | null, getSettings: () => ({ width: 1280, height: 720 }) };
  return { value: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream, track };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal('isSecureContext', true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['jpeg'])));
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1280, height: 720, close: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('camera lifecycle', () => {
  it('deduplicates starts and disposes a late stream after Stop', async () => {
    const resource = stream();
    let resolve!: (value: MediaStream) => void;
    getUserMedia.mockReturnValue(new Promise<MediaStream>(done => { resolve = done; }));
    render(<Harness />);
    let pending!: Promise<void>;
    act(() => { pending = camera.startStream(); void camera.startStream(); });
    expect(getUserMedia).toHaveBeenCalledOnce();
    act(() => camera.stopStream());
    await act(async () => { resolve(resource.value); await pending; });
    expect(resource.track.stop).toHaveBeenCalledOnce();
    expect(camera.isStreaming).toBe(false);
    expect(camera.isStarting).toBe(false);
    expect(camera.liveVideoRef.current?.srcObject).toBeNull();
  });

  it('disposes permission requests that resolve after unmount', async () => {
    const resource = stream();
    let resolve!: (value: MediaStream) => void;
    getUserMedia.mockReturnValue(new Promise<MediaStream>(done => { resolve = done; }));
    const view = render(<Harness />);
    let pending!: Promise<void>;
    act(() => { pending = camera.startStream(); });
    view.unmount();
    resolve(resource.value);
    await pending;
    expect(resource.track.stop).toHaveBeenCalledOnce();
  });

  it('cleans up failed preview playback and allows a subsequent retry', async () => {
    const first = stream();
    const second = stream();
    getUserMedia.mockResolvedValueOnce(first.value).mockResolvedValueOnce(second.value);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('preview failed')).mockResolvedValue();
    render(<Harness />);
    await act(() => camera.startStream());
    expect(camera.errorMessage).toBe('preview failed');
    expect(first.track.stop).toHaveBeenCalled();
    await act(() => camera.startStream());
    expect(camera.isStreaming).toBe(true);
    expect(camera.errorMessage).toBe('');
  });

  it('keeps capture serial, even when JPEG encoding is slow', async () => {
    const resource = stream();
    getUserMedia.mockResolvedValue(resource.value);
    let complete!: BlobCallback;
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => { complete = callback; });
    render(<Harness />);
    await act(() => camera.startStream());
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(toBlob).toHaveBeenCalledOnce();
    act(() => camera.stopStream());
    await act(async () => { complete(new Blob(['late'])); });
    expect(camera.stats.frames).toBe(0);
  });

  it('freezes export, rebuilds history on Resume, and still detects disconnects', async () => {
    const resource = stream();
    getUserMedia.mockResolvedValue(resource.value);
    render(<Harness />);
    await act(() => camera.startStream());
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(camera.hasDelayedFrame).toBe(true);
    let snapshot!: ReturnType<typeof camera.getFramesForExport>;
    act(() => { snapshot = camera.getFramesForExport(); });
    expect(snapshot.length).toBeGreaterThan(0);
    expect(camera.isPaused).toBe(true);
    expect(resource.track.enabled).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    act(() => camera.resumeStream());
    expect(camera.hasDelayedFrame).toBe(false);
    expect(resource.track.enabled).toBe(true);
    act(() => resource.track.onended?.());
    expect(camera.isStreaming).toBe(false);
    expect(camera.errorMessage).toContain('disconnected');
  });

  it('preserves paused history when delay/buffer settings change after a long pause', async () => {
    getUserMedia.mockResolvedValue(stream().value);
    const view = render(<Harness />);
    await act(() => camera.startStream());
    await act(() => vi.advanceTimersByTimeAsync(1500));
    let count = 0;
    act(() => { count = camera.getFramesForExport().length; });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    view.rerender(<Harness buffer={3} />);
    expect(camera.getFramesForExport().length).toBe(count);
  });

  it('restarts the camera when resolution changes and cleans up a failed switch', async () => {
    const resource = stream();
    const replacement = stream();
    getUserMedia.mockResolvedValueOnce(resource.value).mockResolvedValueOnce(replacement.value).mockRejectedValueOnce(new DOMException('absent', 'NotFoundError'));
    render(<Harness />);
    await act(() => camera.startStream());
    await act(async () => { camera.changeResolution('1080p'); });
    expect(resource.track.stop).toHaveBeenCalledOnce();
    expect(camera.resolution).toBe('1080p');
    expect(getUserMedia.mock.calls[1][0].video.width.ideal).toBe(1920);
    await act(async () => { camera.switchCamera(); });
    expect(replacement.track.stop).toHaveBeenCalled();
    expect(camera.isStreaming).toBe(false);
    expect(camera.errorMessage).toContain('unavailable');
  });

  it('pauses a hidden tab and cancels a pending camera request', async () => {
    const resource = stream();
    getUserMedia.mockResolvedValueOnce(resource.value);
    render(<Harness />);
    await act(() => camera.startStream());
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(camera.isPaused).toBe(true);
    expect(resource.track.enabled).toBe(false);
    act(() => camera.stopStream());
    let resolve!: (value: MediaStream) => void;
    const late = stream();
    getUserMedia.mockReturnValueOnce(new Promise<MediaStream>(done => { resolve = done; }));
    let pending!: Promise<void>;
    act(() => { pending = camera.startStream(); });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => { resolve(late.value); await pending; });
    expect(late.track.stop).toHaveBeenCalledOnce();
    expect(camera.isStreaming).toBe(false);
  });
});
