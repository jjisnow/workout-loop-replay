import { afterEach, expect, it, vi } from 'vitest';
import { loadFrameImage } from '../src/lib/frameImage';

afterEach(() => vi.unstubAllGlobals());

it('closes a late bitmap when its export was cancelled during decoding', async () => {
  let resolve!: (value: ImageBitmap) => void;
  vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(done => { resolve = done; })));
  const controller = new AbortController();
  const pending = loadFrameImage(new Blob(['jpeg']), controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  const close = vi.fn();
  resolve({ width: 1280, height: 720, close } as unknown as ImageBitmap);
  await Promise.resolve();
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
});

it('does not begin decoding an already cancelled export', async () => {
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);
  const controller = new AbortController();
  controller.abort();
  await expect(loadFrameImage(new Blob(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(decode).not.toHaveBeenCalled();
});
