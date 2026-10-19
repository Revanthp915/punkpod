/** Pure domain helpers shared by tests and a future API implementation. */
export const DEFAULT_POD_CAPACITY = 6;
export const PUBLIC_COMMONS_CAPACITY = 128;

export function hasPodCapacity(currentMembers, capacity = DEFAULT_POD_CAPACITY) {
  return Number.isInteger(currentMembers) && currentMembers >= 0 &&
    Number.isInteger(capacity) && capacity > 0 && currentMembers < capacity;
}

export function taskCompletionPercentage(tasks = []) {
  if (!Array.isArray(tasks) || tasks.length === 0) return 0;
  const completed = tasks.filter((task) => task && task.done === true).length;
  return Math.round((completed / tasks.length) * 100);
}

export function searchCatalogue(entries, query = '', type = 'all') {
  const needle = String(query).trim().toLowerCase();
  const selectedType = String(type).trim().toLowerCase();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (selectedType !== 'all' && String(entry.type).toLowerCase() !== selectedType) return false;
    const searchable = [entry.title, entry.desc, ...(entry.tags || [])]
      .filter(Boolean).join(' ').toLowerCase();
    return !needle || searchable.includes(needle);
  });
}

export const DEFAULT_ENTITLEMENTS = Object.freeze({
  plan: 'free',
  canCreatePrivateGroup: false,
  canUseOneToOneMatching: true,
  canExportSummary: false,
});

export function resolveEntitlements(overrides = {}) {
  return { ...DEFAULT_ENTITLEMENTS, ...overrides };
}

export const BREAK_MODES = Object.freeze({
  short: { label: 'Short break', minutes: 5 },
  long: { label: 'Long break', minutes: 15 },
  breakfast: { label: 'Breakfast', minutes: 30 },
  lunch: { label: 'Lunch', minutes: 45 },
  dinner: { label: 'Dinner', minutes: 45 },
  snack: { label: 'Snack', minutes: 15 },
  rest: { label: 'Rest or walk', minutes: 15 },
  custom: { label: 'Custom break', minutes: 10 },
});

export function normaliseDurationMinutes(value, fallback = 1) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return fallback;
  return Math.min(24 * 60, Math.max(1, Math.round(minutes)));
}

export function sessionKind(mode) {
  return mode === 'focus' ? 'focus' : 'break';
}

export function completedSession({ kind, startedAt, endedAt, elapsedSeconds }) {
  const seconds = Number(elapsedSeconds);
  if (!startedAt || !endedAt || !Number.isFinite(seconds) || seconds < 1) return null;
  return {
    kind: sessionKind(kind),
    startedAt,
    endedAt,
    minutes: Math.max(1, Math.floor(seconds / 60)),
  };
}

export function sessionMinutes(sessions = [], kind = 'focus') {
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session && session.kind === kind && Number.isFinite(Number(session.minutes)))
    .reduce((total, session) => total + Math.max(0, Number(session.minutes)), 0);
}

export function formatCount(count, singular, plural = `${singular}s`) {
  const value = Number(count) || 0;
  return `${value} ${value === 1 ? singular : plural}`;
}

export function focusReminderDue(continuousSeconds, lastShownSeconds = 0, minimumSeconds = 60 * 60, snoozeSeconds = 15 * 60) {
  const continuous = Number(continuousSeconds);
  const lastShown = Number(lastShownSeconds);
  return Number.isFinite(continuous) && continuous >= minimumSeconds &&
    (!Number.isFinite(lastShown) || continuous - lastShown >= snoozeSeconds);
}
