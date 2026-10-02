import { describe, expect, it } from 'vitest';
import { FrameBuffer } from '../src/lib/frameBuffer';

const frame = (timestamp: number, size = 5) => ({ timestamp, blob: new Blob(['x'.repeat(size)]) });

describe('timestamped buffer', () => {
  it('uses elapsed time despite dropped frames and refuses unavailable history', () => {
    const buffer = new FrameBuffer();
    [0, 100, 1700, 2800, 3100].forEach(t => buffer.push(frame(t), 5));
    expect(buffer.atTime(-1)).toBeUndefined();
    expect(buffer.atTime(2900)?.timestamp).toBe(2800);
    expect(buffer.atTime(1500)).toBeUndefined(); // stale image is not a valid delayed frame
    expect(buffer.durationSeconds).toBe(3.1);
  });

  it('keeps the duration boundary and handles ring wrap-around', () => {
    const buffer = new FrameBuffer(4);
    [0, 100, 200, 300, 400, 500].forEach(t => buffer.push(frame(t), 0.2));
    expect(buffer.snapshot().map(f => f.timestamp)).toEqual([300, 400, 500]);
    expect(buffer.atTime(300)?.timestamp).toBe(300);
    buffer.clear();
    expect(buffer.length).toBe(0);
    expect(buffer.bytes).toBe(0);
    buffer.push(frame(10), 1);
    expect(buffer.snapshot()[0].timestamp).toBe(10);
  });

  it('bounds bytes and frames, and does not retain oversized or out-of-order frames', () => {
    const buffer = new FrameBuffer(3, 10);
    [0, 100, 200].forEach(t => buffer.push(frame(t), 5));
    expect(buffer.bytes).toBe(10);
    expect(buffer.snapshot().map(f => f.timestamp)).toEqual([100, 200]);
    buffer.push(frame(300, 11), 5);
    buffer.push(frame(150), 5);
    expect(buffer.bytes).toBe(10);
    expect(buffer.length).toBe(2);
    expect(buffer.atTime(0)).toBeUndefined();
  });

  it('allows a stable export snapshot while clearing the live buffer', () => {
    const buffer = new FrameBuffer();
    buffer.push(frame(100), 15);
    const snapshot = buffer.snapshot();
    buffer.clear();
    expect(snapshot[0].blob.size).toBe(5);
    expect(buffer.length).toBe(0);
  });
});
