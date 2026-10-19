import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/server.js';
import { createDatabase } from '../src/db.js';

async function withApp(run: (app: ReturnType<typeof buildApp>) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'punkpod-'));
  const app = buildApp(createDatabase(join(directory, 'test.sqlite')));
  try {
    await run(app);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

const match = (app: ReturnType<typeof buildApp>, userId: string) => app.inject({
  method: 'POST',
  url: '/api/v1/matching',
  headers: { 'x-user-id': userId },
  payload: { mode: 'Random pod', language: 'English', learningPath: 'Computer Science & AI' },
});

test('pod detail reports stable identity, capacity, member count, and members', async () => {
  await withApp(async app => {
    const first = await match(app, 'member-1');
    assert.equal(first.statusCode, 201);
    const pod = first.json();
    assert.equal(pod.capacity, 6);
    assert.equal(pod.memberCount, 1);
    assert.equal(typeof pod.invitationCode, 'string');
    assert.equal(pod.podType, 'study');

    const detail = await app.inject({ method: 'GET', url: `/api/v1/pods/${pod.id}`, headers: { 'x-user-id': 'member-1' } });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().id, pod.id);
    assert.equal(detail.json().memberCount, 1);
    assert.deepEqual(detail.json().members.map((member: { id: string }) => member.id), ['member-1']);

    const forbidden = await app.inject({ method: 'GET', url: `/api/v1/pods/${pod.id}`, headers: { 'x-user-id': 'not-a-member' } });
    assert.equal(forbidden.statusCode, 403);
  });
});

test('matching is idempotent and does not place a seventh member in a study pod', async () => {
  await withApp(async app => {
    const responses = [];
    for (let index = 1; index <= 6; index += 1) responses.push(await match(app, `member-${index}`));
    const firstPod = responses[0].json();
    assert.equal(firstPod.memberCount, 1);
    assert.equal(responses[5].json().id, firstPod.id);
    assert.equal(responses[5].json().memberCount, 6);

    const retry = await match(app, 'member-6');
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().id, firstPod.id);
    assert.equal(retry.json().memberCount, 6);

    const seventh = await match(app, 'member-7');
    assert.equal(seventh.statusCode, 201);
    assert.notEqual(seventh.json().id, firstPod.id);
    assert.equal(seventh.json().memberCount, 1);
  });
});
