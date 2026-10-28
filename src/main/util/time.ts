export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function startOfNextDay(date: Date): Date {
  const next = new Date(date.getTime());
  next.setHours(24, 0, 5, 0);
  return next;
}

export function atClockOnDate(date: Date, clock: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  const next = new Date(date.getTime());
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}
