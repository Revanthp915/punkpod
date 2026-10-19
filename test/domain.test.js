import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREAK_MODES,
  completedSession,
  DEFAULT_ENTITLEMENTS,
  PUBLIC_COMMONS_CAPACITY,
  formatCount,
  focusReminderDue,
  hasPodCapacity,
  resolveEntitlements,
  searchCatalogue,
  sessionMinutes,
  normaliseDurationMinutes,
  sessionKind,
  taskCompletionPercentage,
} from '../src/domain.js';

const catalogue = [
  { type: 'exam', title: 'JEE Main + Advanced', desc: 'Engineering entrance prep', tags: ['Physics', 'Maths'] },
  { type: 'degree', title: 'Computer Science & AI', desc: 'Systems and applied intelligence', tags: ['Coding', 'Data'] },
  { type: 'career', title: 'Banking & SSC', desc: 'Quant and reasoning', tags: ['Government'] },
];

test('matching accepts a pod below capacity and rejects a full pod', () => {
  assert.equal(hasPodCapacity(5, 6), true);
  assert.equal(hasPodCapacity(6, 6), false);
  assert.equal(hasPodCapacity(-1, 6), false);
});

test('task completion percentage rounds and handles an empty plan', () => {
  assert.equal(taskCompletionPercentage([]), 0);
  assert.equal(taskCompletionPercentage([{ done: true }, { done: false }, { done: true }]), 67);
  assert.equal(taskCompletionPercentage([{ done: true }, { done: true }]), 100);
});

test('catalogue search matches title, tags, and optional type filter', () => {
  assert.equal(searchCatalogue(catalogue, 'physics').length, 1);
  assert.equal(searchCatalogue(catalogue, 'systems', 'degree')[0].title, 'Computer Science & AI');
  assert.equal(searchCatalogue(catalogue, 'engineering', 'career').length, 0);
  assert.equal(searchCatalogue(catalogue, '').length, 3);
});

test('free users receive safe entitlement defaults and explicit overrides', () => {
  assert.deepEqual(resolveEntitlements(), DEFAULT_ENTITLEMENTS);
  assert.equal(resolveEntitlements({ plan: 'pro', canExportSummary: true }).canCreatePrivateGroup, false);
  assert.equal(resolveEntitlements({ plan: 'pro', canExportSummary: true }).canExportSummary, true);
});

test('standard pods and public commons have explicit separate capacities', () => {
  assert.equal(hasPodCapacity(5), true);
  assert.equal(hasPodCapacity(6), false);
  assert.equal(PUBLIC_COMMONS_CAPACITY, 128);
});

test('focus and break minutes stay separate', () => {
  const sessions = [{ kind: 'focus', minutes: 25 }, { kind: 'break', minutes: 5 }, { kind: 'focus', minutes: 10 }];
  assert.equal(sessionMinutes(sessions, 'focus'), 35);
  assert.equal(sessionMinutes(sessions, 'break'), 5);
  assert.equal(BREAK_MODES.lunch.minutes, 45);
});

test('count wording is singular only for one item', () => {
  assert.equal(formatCount(1, 'task', 'tasks'), '1 task');
  assert.equal(formatCount(2, 'task', 'tasks'), '2 tasks');
});

test('break modes include rest and custom choices with bounded durations', () => {
  assert.equal(BREAK_MODES.rest.label, 'Rest or walk');
  assert.equal(BREAK_MODES.custom.label, 'Custom break');
  assert.equal(normaliseDurationMinutes(0), 1);
  assert.equal(normaliseDurationMinutes(1500), 1440);
  assert.equal(normaliseDurationMinutes('20.4'), 20);
});

test('completed sessions keep focus and break data distinct', () => {
  assert.equal(sessionKind('focus'), 'focus');
  assert.equal(sessionKind('lunch'), 'break');
  assert.deepEqual(completedSession({ kind: 'lunch', startedAt: '2026-10-19T10:00:00Z', endedAt: '2026-10-19T10:45:00Z', elapsedSeconds: 2700 }), {
    kind: 'break', startedAt: '2026-10-19T10:00:00Z', endedAt: '2026-10-19T10:45:00Z', minutes: 45,
  });
  assert.equal(completedSession({ kind: 'focus', startedAt: 'now', endedAt: null, elapsedSeconds: 60 }), null);
});

test('focus reminder uses continuous focus time and supports a later snooze', () => {
  assert.equal(focusReminderDue(3599, 0), false);
  assert.equal(focusReminderDue(3600, 0), true);
  assert.equal(focusReminderDue(3610, 3600), false);
  assert.equal(focusReminderDue(4500, 3600), true);
});
