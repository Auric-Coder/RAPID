const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(relative, mocks, globals = {}) {
  const filename = path.resolve(__dirname, relative);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-react-jsx']
  });
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => mocks[name] || require(name),
    React, console, setTimeout, clearTimeout, AbortController, ...globals
  }, { filename });
  return module.exports;
}

async function fixture(t, options = {}) {
  const state = { profile: { id: 'owner' }, tracking: 'reported', calls: [], watchers: [], timers: new Set(), granted: true, services: true };
  let appListener;
  const position = timestamp => ({ coords: { latitude: 15.49, longitude: 73.82, accuracy: 8 }, timestamp: timestamp ?? Date.now() });
  const api = {
    trackEmergency: async () => ({ status: state.tracking }),
    updateLocation: async (...args) => {
      state.calls.push(args);
      if (state.failure) throw state.failure;
      return { lastUpdated: new Date().toISOString() };
    }
  };
  const exports = load('../src/context/LocationSharingContext.js', {
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, fn) => { appListener = fn; return { remove() {} }; } } },
    'expo-location': {
      Accuracy: { High: 4 },
      requestForegroundPermissionsAsync: async () => ({ granted: state.granted }),
      hasServicesEnabledAsync: async () => state.services,
      getCurrentPositionAsync: async () => position(),
      watchPositionAsync: async (_, callback) => {
        const watcher = { callback, removed: false, remove() { this.removed = true; } };
        state.watchers.push(watcher);
        if (options.deferWatch) await new Promise(resolve => { state.resolveWatch = resolve; });
        return watcher;
      }
    },
    '../api/client': { citizenApi: api },
    './AuthContext': { useAuth: () => ({ profile: state.profile }) }
  }, {
    setInterval: fn => { state.timers.add(fn); return fn; },
    clearInterval: fn => state.timers.delete(fn)
  });
  function Probe() { state.value = exports.useLocationSharing(); return null; }
  const tree = () => React.createElement(exports.LocationSharingProvider, null, React.createElement(Probe));
  let root;
  await act(async () => { root = create(tree()); });
  t.after(async () => { await act(async () => root.unmount()); });
  return Object.assign(state, {
    exports,
    start: async (token = 'signed-token') => act(async () => state.value.startSharing({ incidentId: 'sos-1', locationToken: token }, { lat: 15.49, lng: 73.82 })),
    emit: async timestamp => act(async () => state.watchers.at(-1).callback(position(timestamp))),
    tick: async () => act(async () => { for (const fn of state.timers) await fn(); }),
    app: async value => act(async () => appListener(value)),
    logout: async () => act(async () => { state.profile = null; root.update(tree()); })
  });
}

test('foreground sharing acknowledges updates, pauses, resumes, stops, and cleans up on logout', async t => {
  const f = await fixture(t);
  assert.equal(f.watchers.length, 0);
  await f.start();
  assert.equal(f.watchers.length, 1);
  await f.emit();
  await f.tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], 'sos-1');
  assert.equal(f.calls[0][1], 'signed-token');
  assert.ok(f.value.lastUpdated);
  await f.app('background');
  assert.ok(f.watchers[0].removed);
  assert.ok(f.calls[0][3].aborted);
  await f.emit(); // late native callback must not start a new request
  await f.tick();
  assert.equal(f.calls.length, 1);
  await f.app('active');
  assert.equal(f.watchers.length, 2);
  await f.emit();
  await f.tick();
  assert.equal(f.calls.length, 2);
  await act(async () => f.value.stopSharing());
  assert.ok(f.watchers[1].removed);
  await f.tick();
  assert.equal(f.calls.length, 2);
  await act(async () => f.value.resumeSharing());
  assert.equal(f.watchers.length, 3);
  await f.logout();
  assert.ok(f.watchers[2].removed);
  assert.equal(f.value.incidentId, undefined);
});

test('network failures retry, stale fixes are skipped, and resolution ends sharing', async t => {
  const f = await fixture(t);
  await f.start();
  await f.emit(Date.now() - 90000);
  await f.tick();
  assert.equal(f.calls.length, 0);
  f.failure = new Error('offline');
  await f.emit();
  await f.tick();
  assert.equal(f.value.error, 'offline');
  assert.equal(f.value.lastUpdated, null);
  f.failure = null;
  await f.tick();
  assert.ok(f.value.lastUpdated);
  assert.equal(f.value.error, null);
  f.tracking = 'resolved';
  await f.tick();
  assert.equal(f.value.enabled, false);
  assert.ok(f.watchers[0].removed);
});

test('authorization failure stops requests', async t => {
  const f = await fixture(t);
  await f.start();
  f.failure = Object.assign(new Error('expired'), { status: 403 });
  await f.emit();
  await f.tick();
  assert.equal(f.value.enabled, false);
  assert.ok(f.watchers[0].removed);
});

test('subscription resolving after stop is immediately removed', async t => {
  const f = await fixture(t, { deferWatch: true });
  await f.start();
  await act(async () => f.value.stopSharing());
  await act(async () => f.resolveWatch());
  assert.ok(f.watchers[0].removed);
  assert.equal(f.timers.size, 0);
});

test('permission denial and disabled GPS are actionable without starting a watcher', async t => {
  const f = await fixture(t);
  f.granted = false;
  await assert.rejects(f.exports.getEmergencyLocation(), /permission denied/);
  await f.start();
  assert.equal(f.watchers.length, 0);
  assert.equal(f.value.enabled, false);
  f.granted = true;
  f.services = false;
  await assert.rejects(f.exports.getEmergencyLocation(), /services are off/);
});

test('older backend without capability reports unavailable sharing rather than pretending success', async t => {
  const f = await fixture(t);
  await f.start(null);
  assert.equal(f.watchers.length, 0);
  assert.equal(f.value.enabled, false);
  assert.match(f.value.error, /server needs/);
});

test('API URL uses explicit settings, then LAN Expo host, then emulator fallback', () => {
  const resolve = (env, hostUri, dev = true) => load('../src/api/client.js', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-constants': { expoConfig: { hostUri } },
    '@react-native-async-storage/async-storage': {}
  }, { process: { env }, __DEV__: dev }).API_BASE;
  assert.equal(resolve({ EXPO_PUBLIC_API_URL: 'https://api.example.com/' }, '192.168.1.2:8081'), 'https://api.example.com');
  assert.equal(resolve({ EXPO_PUBLIC_API_HOST: '192.168.1.3' }, ''), 'http://192.168.1.3:5000');
  assert.equal(resolve({}, '192.168.1.2:8081'), 'http://192.168.1.2:5000');
  assert.equal(resolve({}, '172.16.0.2:8081'), 'http://172.16.0.2:5000');
  assert.equal(resolve({}, 'example.exp.direct:8081'), 'http://10.0.2.2:5000');
  assert.equal(resolve({}, undefined), 'http://10.0.2.2:5000');
});
