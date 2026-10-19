export const BREAK_CATEGORIES = [
  'short',
  'long',
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'rest',
  'custom',
] as const;

const MAX_SESSION_MINUTES = 24 * 60;

export type SessionKind = 'focus' | 'break';

export type CompletedSessionInput = {
  kind: SessionKind;
  startedAt: string;
  endedAt: string;
  breakCategory: string | null;
  minutes: number;
};

type RawInput = {
  kind?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  breakCategory?: unknown;
  minutes?: unknown;
  elapsedSeconds?: unknown;
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function integer(value: unknown) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export function parseCompletedSession(input: RawInput): CompletedSessionInput | null {
  const kind = text(input.kind || 'focus');
  if (kind !== 'focus' && kind !== 'break') return null;

  const startedAt = text(input.startedAt);
  const endedAt = text(input.endedAt);
  if (!startedAt || !endedAt) return null;

  const categoryText = text(input.breakCategory);
  const breakCategory = categoryText || null;
  if (breakCategory && !BREAK_CATEGORIES.includes(breakCategory as typeof BREAK_CATEGORIES[number])) return null;
  if (kind === 'focus' && breakCategory) return null;

  let minutes = integer(input.minutes);
  if (minutes === null && input.elapsedSeconds !== undefined) {
    const seconds = integer(input.elapsedSeconds);
    if (seconds !== null && seconds > 0) minutes = Math.floor(seconds / 60);
  }
  if (minutes === null || minutes < 1 || minutes > MAX_SESSION_MINUTES) return null;

  return { kind, startedAt, endedAt, breakCategory: kind === 'break' ? breakCategory : null, minutes };
}
