const INVITE_RE = /AILE-\d{6}/i;

export function extractInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.trim().toUpperCase().replace(/\s+/g, '');
  const match = compact.match(INVITE_RE);
  return match ? match[0].toUpperCase() : null;
}

export function familyJoinUrl(inviteCode: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://family.rfqcollector.com';
  const webOrigin =
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.startsWith('capacitor:') ||
    origin.startsWith('https://localhost')
      ? 'https://family.rfqcollector.com'
      : origin;
  return `${webOrigin}/join?code=${encodeURIComponent(inviteCode)}`;
}

export const PENDING_INVITE_KEY = 'pending_invite_code';

export function stashPendingInvite(code: string): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // ignore
  }
}

export function peekPendingInvite(): string | null {
  try {
    return extractInviteCode(sessionStorage.getItem(PENDING_INVITE_KEY));
  } catch {
    return null;
  }
}

export function takePendingInvite(): string | null {
  const value = peekPendingInvite();
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // ignore
  }
  return value;
}
