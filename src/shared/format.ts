export function formatViewCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return '0';
  }

  if (count >= 100_000_000) {
    return `${trimTrailingZero(count / 100_000_000)}亿`;
  }

  if (count >= 10_000) {
    return `${trimTrailingZero(count / 10_000)}万`;
  }

  return String(Math.round(count));
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function truncateText(text: string, limit: number): string {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (cleanText.length <= limit) {
    return cleanText;
  }

  return `${cleanText.slice(0, Math.max(1, limit - 1))}…`;
}

function trimTrailingZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}
