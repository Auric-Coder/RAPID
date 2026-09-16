const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const express = require('express');
const jwt = require('jsonwebtoken');

// Real Express routing and JWT verification, isolated database/dispatch fixtures.
// Never loads production credentials, sends a real dispatch, or touches a database.
test('citizen SOS location API', async t => {
  const secret = 'location-test-secret-not-for-production';
  const incidents = new Map();
  const events = [];
  let failWrites = false;
  const profiles = [{ id: 'owner', full_name: 'Test Citizen', phone: 'test' }, { id: 'other' }];
  const db = {
    citizenProfiles: { get: async id => profiles.find(p => p.id === id) },
    incidents: {
      create: async data => {
        const row = { ...data, id: `incident-${incidents.size}`, status: 'reported' };
        incidents.set(row.id, row);
        return row;
      },
      get: async id => incidents.get(id),
      update: async (id, values) => {
        if (failWrites) throw new Error('database offline');
        Object.assign(incidents.get(id), values);
        return incidents.get(id);
      }
    }
  };
  const filename = path.resolve(__dirname, '../src/routes/citizen.js');
  const realRequire = createRequire(filename);
  const mocks = {
    '../config/database': db,
    '../config/authConfig': { JWT_SECRET: secret },
    '../services/dispatchService': { dispatchService: { autoDispatch: async () => null } },
    '../services/voiceAI/voicePipeline': {},
    '../services/websocketService': {
      broadcastIncidentCreated: row => events.push(JSON.parse(JSON.stringify(row))),
      broadcastIncidentUpdate: row => events.push(JSON.parse(JSON.stringify(row)))
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: name => mocks[name] || realRequire(name), module, exports: module.exports, Buffer, console
  }, { filename });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/citizen', module.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/citizen`;
  async function request(route, body, who = 'owner', method = 'PATCH') {
    const res = await fetch(base + route, {
      method, headers: {
        'Content-Type': 'application/json',
        ...(who ? { Authorization: `Bearer ${Buffer.from(`citizen:${who}`).toString('base64')}` } : {})
      }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }
  const fix = () => ({ lat: 15.49, lng: 73.82, accuracy_m: 8, timestamp: Date.now() });
  const created = await request('/emergency', { location: fix(), category: 'other' }, 'owner', 'POST');
  assert.equal(created.status, 201);
  const { incidentId, locationToken } = created.body;
  const route = `/emergency/${incidentId}/location`;
  const claims = jwt.verify(locationToken, secret, { audience: 'citizen-location-update' });
  assert.equal(claims.sub, 'owner');
  assert.equal(claims.incidentId, incidentId);

  await t.test('saves a fresh fix and emits the existing dashboard event without leaking capability', async () => {
    const result = await request(route, { locationToken, location: fix() });
    assert.equal(result.status, 200);
    assert.ok(Date.parse(result.body.lastUpdated));
    assert.equal(incidents.get(incidentId).latitude, 15.49);
    assert.equal(events.at(-1).longitude, 73.82);
    assert.ok(events.every(event => !event.locationToken));
  });
  await t.test('rejects missing citizen auth, missing capability, another citizen and another incident', async () => {
    const body = { locationToken, location: fix() };
    assert.equal((await request(route, body, null)).status, 401);
    assert.equal((await request(route, { location: fix() })).status, 403);
    assert.equal((await request(route, body, 'other')).status, 403);
    assert.equal((await request('/emergency/another/location', body)).status, 403);
    assert.equal((await request(route, undefined)).status, 403);
  });
  await t.test('rejects expired or forged capabilities', async () => {
    const expired = jwt.sign({ incidentId }, secret, { audience: 'citizen-location-update', subject: 'owner', expiresIn: -1 });
    for (const token of [expired, locationToken + 'x']) {
      assert.equal((await request(route, { locationToken: token, location: fix() })).status, 403);
    }
  });
  await t.test('rejects invalid, stale and future GPS fixes without modifying the incident', async () => {
    const count = events.length;
    for (const location of [null, { ...fix(), lat: 91 }, { ...fix(), lng: '73' }, { ...fix(), accuracy_m: -1 }, { ...fix(), timestamp: 1 }, { ...fix(), timestamp: Date.now() + 90000 }]) {
      assert.equal((await request(route, { locationToken, location })).status, 400);
    }
    assert.equal(events.length, count);
    assert.equal((await request('/emergency', { location: { lat: null, lng: 0 }, category: 'other' }, 'owner', 'POST')).status, 400);
  });
  await t.test('database failures are retryable and do not broadcast success', async () => {
    failWrites = true;
    const count = events.length;
    assert.equal((await request(route, { locationToken, location: fix() })).status, 500);
    assert.equal(events.length, count);
    failWrites = false;
  });
  await t.test('resolved and cancelled emergencies reject further sharing', async () => {
    for (const status of ['resolved', 'cancelled']) {
      incidents.get(incidentId).status = status;
      assert.equal((await request(route, { locationToken, location: fix() })).status, 409);
    }
  });
  await t.test('missing incident returns 404', async () => {
    incidents.delete(incidentId);
    assert.equal((await request(route, { locationToken, location: fix() })).status, 404);
  });
});
