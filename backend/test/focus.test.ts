import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompletedSession } from '../src/focus.js';

const times = { startedAt: '2026-10-19T10:00:00Z', endedAt: '2026-10-19T10:25:00Z' };

test('parses legacy whole-minute focus payloads without rounding', () => {
  assert.deepEqual(parseCompletedSession({ ...times, kind: 'focus', minutes: '25.5' }), null);
  assert.equal(parseCompletedSession({ ...times, kind: 'focus', minutes: '25' })?.minutes, 25);
});

test('persists an allowed break category and floors elapsed seconds to minutes', () => {
  const session = parseCompletedSession({ ...times, kind: 'break', breakCategory: 'lunch', elapsedSeconds: 2759 });
  assert.equal(session?.breakCategory, 'lunch');
  assert.equal(session?.minutes, 45);
});

test('rejects unknown categories, focus categories, and incomplete durations', () => {
  assert.equal(parseCompletedSession({ ...times, kind: 'break', breakCategory: 'coffee', minutes: 5 }), null);
  assert.equal(parseCompletedSession({ ...times, kind: 'focus', breakCategory: 'short', minutes: 5 }), null);
  assert.equal(parseCompletedSession({ ...times, kind: 'focus', minutes: 0 }), null);
  assert.equal(parseCompletedSession({ ...times, kind: 'focus', elapsedSeconds: 59 }), null);
});
