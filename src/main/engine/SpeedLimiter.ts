/**
 * Token bucket shared by every connection. `rate` is bytes/sec, 0 = unlimited.
 * Connections call `consume(n)` after reading a chunk; the await is what throttles them.
 */
export class SpeedLimiter {
  private tokens = 0
  private last = Date.now()

  constructor(private rate = 0) {}

  setRate(bytesPerSec: number): void {
    this.rate = Math.max(0, bytesPerSec)
    this.tokens = Math.min(this.tokens, this.rate)
  }

  get limited(): boolean {
    return this.rate > 0
  }

  async consume(bytes: number, signal?: AbortSignal): Promise<void> {
    if (!this.rate) return
    this.refill()
    this.tokens -= bytes
    while (this.tokens < 0 && this.rate && !signal?.aborted) {
      const waitMs = Math.min(1000, Math.ceil((-this.tokens / this.rate) * 1000))
      await new Promise((r) => setTimeout(r, Math.max(10, waitMs)))
      this.refill()
    }
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.last) / 1000
    this.last = now
    // Burst capped at one second worth of data so the limit stays smooth
    this.tokens = Math.min(this.rate, this.tokens + elapsed * this.rate)
  }
}
