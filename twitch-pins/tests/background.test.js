import test from 'node:test';
import assert from 'node:assert/strict';

let instance = 0;
async function setup(initial = {}, network = async () => new Response(JSON.stringify([{ data: { user: { login: 'example', displayName: 'Example', stream: null } } }]))) {
  const data = structuredClone(initial), calls = [], listeners = {};
  const event = name => ({ addListener: fn => { listeners[name] = fn; } });
  globalThis.chrome = {
    storage: { local: { get: async keys => Object.fromEntries(keys.filter(key => key in data).map(key => [key, structuredClone(data[key])])), set: async patch => { Object.assign(data, structuredClone(patch)); } } },
    runtime: { getURL: path => 'chrome-extension://pins/' + path, onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup') },
    alarms: { clear: async name => calls.push(['clear', name]), create: async (name, options) => calls.push(['alarm', name, options]), onAlarm: event('alarm') },
    tabs: { create: async options => calls.push(['tab', options]) },
    action: { setBadgeText: async options => calls.push(['badge', options]), setBadgeBackgroundColor: async () => {} }
  };
  globalThis.fetch = async (url, options) => { calls.push(['fetch', url, options]); return network(url, options); };
  await import('../background.js?test=' + ++instance);
  const send = (type, args = {}, url = 'https://www.twitch.tv/example') => new Promise(resolve => listeners.message({ type, ...args }, { url }, resolve));
  return { data, calls, listeners, send };
}
const pinned = { login: 'example', displayName: 'example', pinnedAt: 1000 };
function live(session = 'one') { return [{ data: { user: { login: 'example', displayName: 'Example', broadcastSettings: { title: 'Live' }, stream: { id: session, viewersCount: 12 } } } }]; }

test('pinning persists locally, schedules lookups, and does not follow or subscribe', async () => {
  const h = await setup();
  assert.equal((await h.send('PIN', { login: 'EXAMPLE' })).ok, true);
  await h.send('REFRESH');
  assert.equal(h.data.pins[0].login, 'example');
  assert.equal(h.calls.find(call => call[0] === 'alarm')[2].periodInMinutes, 2);
  const request = h.calls.find(call => call[0] === 'fetch');
  assert.equal(request[2].credentials, 'omit');
  assert.equal(request[2].headers.Authorization, undefined);
  assert.match(JSON.parse(request[2].body)[0].query, /^query /);
  assert.doesNotMatch(request[2].body, /mutation|followUser|subscribe/i);
});
test('lookups preserve current status across restarts without stream history', async () => {
  let session = 'one';
  const h = await setup({ pins: [pinned] }, async () => new Response(JSON.stringify(live(session))));
  await h.send('REFRESH'); await h.send('REFRESH');
  assert.equal(h.data.channelState.example.online, true);
  assert.equal('history' in h.data.channelState.example, false);
  session = 'two'; await h.send('REFRESH');
  assert.equal('session' in h.data.channelState.example, false);
  const restarted = await setup(h.data, async () => new Response(JSON.stringify(live(session))));
  await restarted.send('REFRESH');
  assert.equal(restarted.data.channelState.example.online, true);
  assert.equal('history' in restarted.data.channelState.example, false);
});
test('network errors preserve the last status and mark it unavailable', async () => {
  const previous = { online: true, history: [{ session: 'one', firstSeenAt: Date.now() }], checkedAt: 1234 };
  const h = await setup({ pins: [pinned], channelState: { example: previous } }, async () => new Response('', { status: 429 }));
  await h.send('REFRESH');
  assert.equal(h.data.channelState.example.online, true);
  assert.equal('history' in h.data.channelState.example, false);
  assert.match(h.data.channelState.example.error, /429/);
  assert.equal(h.data.lastSuccess, undefined);
  assert.equal(h.calls.filter(call => call[0] === 'badge').at(-1)[1].text, '');
});
test('GraphQL errors and missing channels are not treated as offline', async () => {
  const h = await setup({ pins: [pinned] }, async () => new Response(JSON.stringify([{ errors: [{ message: 'Unavailable' }] }])));
  await h.send('REFRESH');
  assert.equal(h.data.channelState.example.online, undefined);
  assert.match(h.data.channelState.example.error, /unavailable/);
});
test('returned channels must match the requested login', async () => {
  const h = await setup({ pins: [pinned] }, async () => new Response(JSON.stringify([{ data: { user: { login: 'different', stream: { id: 'one' } } } }])));
  await h.send('REFRESH');
  assert.match(h.data.channelState.example.error, /different channel/);
  assert.equal(h.data.channelState.example.online, undefined);
});
test('responses without stream data preserve the last known status', async () => {
  const h = await setup({ pins: [pinned], channelState: { example: { online: true, history: [] } } }, async () => new Response(JSON.stringify([{ data: { user: { login: 'example' } } }])));
  await h.send('REFRESH');
  assert.equal(h.data.channelState.example.online, true);
  assert.match(h.data.channelState.example.error, /valid channel status/);
});
test('unpinning removes channel status and cancels the alarm when the list is empty', async () => {
  const h = await setup({ pins: [pinned], channelState: { example: { online: true, history: [{ session: 'one' }] } } });
  await h.send('UNPIN', { login: 'example' });
  assert.deepEqual(h.data.pins, []);
  assert.deepEqual(h.data.channelState, {});
  assert.equal(h.calls.some(call => call[0] === 'alarm'), false);
});
test('delayed responses do not restore an unpinned channel', async () => {
  let release, resolveResponse;
  const started = new Promise(resolve => { release = resolve; });
  const h = await setup({ pins: [pinned] }, () => { release(); return new Promise(resolve => { resolveResponse = resolve; }); });
  const refresh = h.send('REFRESH');
  await started;
  await h.send('UNPIN', { login: 'example' });
  resolveResponse(new Response(JSON.stringify(live())));
  await refresh;
  assert.deepEqual(h.data.pins, []);
  assert.deepEqual(h.data.channelState, {});
});
test('reorders the list and only opens normalized Twitch channels', async () => {
  const h = await setup({ pins: [pinned, { login: 'other' }] });
  await h.send('MOVE', { login: 'other', direction: 'up' });
  assert.equal(h.data.pins[0].login, 'other');
  await h.send('OPEN_CHANNEL', { login: 'EXAMPLE' });
  assert.deepEqual(h.calls.find(call => call[0] === 'tab')[1], { url: 'https://www.twitch.tv/example' });
  assert.equal((await h.send('OPEN_CHANNEL', { login: 'https://evil.test/example' })).ok, false);
});
test('messages from other sites are rejected', async () => {
  const h = await setup({ pins: [pinned] });
  assert.equal((await h.send('GET_STATE', {}, 'https://www.twitch.tv.evil.test')).ok, false);
  assert.equal((await h.send('PIN', { login: 'other' }, 'https://evil.test')).ok, false);
  assert.equal((await h.send('GET_STATE', {}, 'chrome-extension://pins/popup.html')).ok, true);
});

test('eye button preference persists without changing pins and survives restarts', async () => {
  const h = await setup({ pins: [pinned] });
  const hidden = await h.send('SET_SIDEBAR_COLLAPSED', { collapsed: true });
  assert.equal(hidden.data.sidebarCollapsed, true);
  assert.deepEqual(h.data.pins, [pinned]);
  const restarted = await setup(h.data);
  assert.equal((await restarted.send('GET_STATE')).data.sidebarCollapsed, true);
  await restarted.send('SET_SIDEBAR_COLLAPSED', { collapsed: false });
  assert.equal(restarted.data.sidebarCollapsed, false);
  assert.equal((await restarted.send('SET_SIDEBAR_COLLAPSED', { collapsed: 'false' })).ok, false);
});
test('updates remove old history while preserving pins, order, and preferences', async () => {
  const pins = [pinned, { login: 'other', pinnedAt: 42 }];
  const h = await setup({ pins, sidebarCollapsed: true, channelState: { example: { online: true, session: 'one', history: [{ session: 'one' }], displayName: 'Example' } } });
  await h.listeners.installed();
  assert.deepEqual(h.data.pins, pins);
  assert.equal(h.data.sidebarCollapsed, true);
  assert.deepEqual(h.data.channelState.example, { online: true, displayName: 'Example' });
});
