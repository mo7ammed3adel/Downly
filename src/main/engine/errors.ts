/** Thrown when a download is paused/stopped. Node 16 (Windows 7 build) has no global DOMException. */
export class AbortError extends Error {
  constructor(message = 'Paused') {
    super(message)
    this.name = 'AbortError'
  }
}

export const isAbortError = (err: unknown): boolean => (err as Error | undefined)?.name === 'AbortError'
