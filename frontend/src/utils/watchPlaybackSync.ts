/** Watch Party playback: play/pause is immediate; seek only when position actually diverges. */

export const CONTROL_SEEK_THRESHOLD_MS = 800;
export const RESUME_SEEK_THRESHOLD_MS = 400;
export const LOCAL_CONTROL_MS = 2800;
export const DRIFT_IGNORE_MS = 500;
export const DRIFT_NUDGE_MS = 1800;

export type WatchIntend = 'playing' | 'paused' | 'ended' | 'idle';
export type WatchPlayerEvent = 'playing' | 'paused' | 'ended' | 'buffering' | 'other';

export function needsControlSeek(actualMs: number, targetMs: number, threshold = CONTROL_SEEK_THRESHOLD_MS): boolean {
  return Math.abs(actualMs - targetMs) > threshold;
}

export function mapPlayerEvent(code: number): WatchPlayerEvent {
  if (code === 1) return 'playing';
  if (code === 2) return 'paused';
  if (code === 0) return 'ended';
  if (code === 3) return 'buffering';
  return 'other';
}

/**
 * YouTube fires PLAYING during seek/pause glitches and PAUSED while buffering.
 * Ignore those so we do not echo a second play/pause to the server.
 */
export function shouldIgnorePlayerEvent(args: {
  applying: boolean;
  syncing: boolean;
  intended: WatchIntend;
  event: WatchPlayerEvent;
}): boolean {
  if (args.event === 'buffering' || args.event === 'other') return true;
  if (args.applying || args.syncing) return true;
  if (args.event === 'playing' && args.intended === 'playing') return true;
  if (args.event === 'paused' && (args.intended === 'paused' || args.intended === 'ended')) return true;
  return false;
}
