// 영상 주소 해석. PRD F1-1의 watch, youtu.be, shorts, embed 형식과 11자 영상 ID를 받는다.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);

/** 경로 형식 주소에서 영상 ID가 오는 첫 경로 조각 */
const PATH_PREFIXES = new Set(['shorts', 'embed']);

/** 주소나 영상 ID에서 11자 영상 ID를 꺼낸다. 해석할 수 없으면 null */
export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return value;

  const url = toUrl(value);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (SHORT_HOSTS.has(host)) return validId(segments[0]);
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (segments.length === 1 && segments[0] === 'watch') return validId(url.searchParams.get('v'));
  if (PATH_PREFIXES.has(segments[0])) return validId(segments[1]);
  return null;
}

/** 스킴 없이 붙여 넣은 주소(youtu.be/...)도 해석한다 */
function toUrl(value: string): URL | null {
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function validId(candidate: string | null | undefined): string | null {
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}
