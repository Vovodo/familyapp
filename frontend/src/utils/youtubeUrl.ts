const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export function extractYoutubeVideoId(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim();
  if (YOUTUBE_ID_RE.test(text)) return text;
  if (!text.includes('://')) text = `https://${text}`;

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  const v = parsed.searchParams.get('v');
  if (v && YOUTUBE_ID_RE.test(v.slice(0, 11))) return v.slice(0, 11);

  if ((host === 'youtu.be' || host === 'www.youtu.be') && parts[0]) {
    const id = parts[0].slice(0, 11);
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v', 'e'].includes(parts[0])) {
    const id = parts[1].slice(0, 11);
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  return null;
}

export function formatWatchTime(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
