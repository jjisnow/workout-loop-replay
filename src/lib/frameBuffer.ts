export const CAPTURE_FPS = 10;
export const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export interface CapturedFrame {
  blob: Blob;
  timestamp: number;
}

/** A bounded ring: capture never copies the whole buffer or stores base64 strings. */
export class FrameBuffer {
  private readonly slots: Array<CapturedFrame | undefined>;
  private head = 0;
  private count = 0;
  private byteCount = 0;

  constructor(private readonly capacity = 602, private readonly maxBytes = MAX_BUFFER_BYTES) {
    if (!Number.isInteger(capacity) || capacity < 1 || maxBytes < 1) {
      throw new Error('Invalid buffer limits');
    }
    this.slots = new Array(capacity);
  }

  get length() { return this.count; }
  get bytes() { return this.byteCount; }
  get latestTimestamp() { return this.count ? this.at(this.count - 1)!.timestamp : 0; }
  get durationSeconds() {
    return this.count < 2 ? 0 : (this.at(this.count - 1)!.timestamp - this.at(0)!.timestamp) / 1000;
  }

  private at(index: number) { return this.slots[(this.head + index) % this.capacity]; }

  private removeOldest() {
    const frame = this.at(0);
    if (!frame) return;
    this.byteCount -= frame.blob.size;
    this.slots[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count--;
  }

  push(frame: CapturedFrame, seconds: number) {
    if (!Number.isFinite(frame.timestamp) || frame.blob.size > this.maxBytes) return;
    const latest = this.at(this.count - 1);
    if (latest && frame.timestamp <= latest.timestamp) return;
    if (this.count === this.capacity) this.removeOldest();
    this.slots[(this.head + this.count) % this.capacity] = frame;
    this.count++;
    this.byteCount += frame.blob.size;
    this.trim(seconds, frame.timestamp);
  }

  trim(seconds: number, now: number) {
    const cutoff = now - seconds * 1000;
    // Keep one predecessor at the duration boundary, unless the byte ceiling wins.
    while (this.count > 1 && this.at(1)!.timestamp <= cutoff) this.removeOldest();
    while (this.count && this.byteCount > this.maxBytes) this.removeOldest();
  }

  atTime(timestamp: number): CapturedFrame | undefined {
    if (!this.count || this.at(0)!.timestamp > timestamp) return undefined;
    let low = 0;
    let high = this.count - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.at(mid)!.timestamp <= timestamp) low = mid;
      else high = mid - 1;
    }
    const frame = this.at(low)!;
    // A suspended/overloaded browser must not label a very old image as current.
    return timestamp - frame.timestamp <= 1000 ? frame : undefined;
  }

  snapshot(): CapturedFrame[] {
    return Array.from({ length: this.count }, (_, index) => this.at(index)!);
  }

  clear() {
    this.slots.fill(undefined);
    this.head = this.count = this.byteCount = 0;
  }
}
