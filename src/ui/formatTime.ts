/** 초를 분:초로 바꾼다(예: 75.4 → "1:15"). 1시간이 넘어도 분으로 센다. 소수점 아래는 버린다 */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
