import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../lib.js';

let instance = 0;
async function setup(initial = {}, fetcher = async () => { throw new Error('unexpected network request'); }) {
  const data = structuredClone(initial);
  const calls = [];
  const listeners = {};
  const event = name => ({ addListener: fn => { listeners[name] = fn; } });
  globalThis.chrome = {
    storage: { local: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, structuredClone(data[key])])),
      set: async values => { Object.assign(data, structuredClone(values)); },
      remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
    } },
    runtime: { getURL: path => 'chrome-extension://radar/' + path, onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup'), openOptionsPage: async () => {} },
    alarms: { clear: async name => { calls.push(['alarm-clear', name]); }, create: async (name, options) => { calls.push(['alarm-create', name, options]); }, onAlarm: event('alarm') },
    tabs: { query: async () => [], sendMessage: async () => {}, create: async options => { calls.push(['tab-create', options]); return { id: 42 }; }, update: async (id, options) => { calls.push(['tab-update', id, options]); } },
    action: { setBadgeText: async options => { calls.push(['badge', options]); }, setBadgeBackgroundColor: async () => {} },
    notifications: { create: async (id, options) => { calls.push(['notification', id, options]); }, clear: async id => { calls.push(['notification-clear', id]); }, onButtonClicked: event('button'), onClicked: event('click'), onClosed: event('closed') }
  };
  globalThis.fetch = fetcher;
  await import('../background.js?instance=' + ++instance);
  const send = (type, args = {}, url = 'chrome-extension://radar/options.html') => new Promise(resolve => listeners.message({ type, ...args }, { url }, resolve));
  return { data, calls, listeners, send };
}
const config = () => ({ ...DEFAULT_SETTINGS, twitch: ['example'], desktop: true });
const live = (id, login = 'example') => [{ data: { user: { login, displayName: 'Example', broadcastSettings: { title: 'Live' }, stream: { id } } } }];
const response = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('Twitch monitoring notifies once per stream and survives worker restarts', async () => {
  let session = 'one';
  const h = await setup({ settings: config() }, async () => response(live(session)));
  assert.equal((await h.send('CHECK_NOW')).ok, true);
  assert.equal((await h.send('CHECK_NOW')).ok, true);
  assert.equal(h.calls.filter(item => item[0] === 'notification').length, 1);
  session = 'two';
  await h.send('CHECK_NOW');
  assert.equal(h.calls.filter(item => item[0] === 'notification').length, 2);
  const restarted = await setup(h.data, async () => response(live(session)));
  await restarted.send('CHECK_NOW');
  assert.equal(restarted.calls.filter(item => item[0] === 'notification').length, 0);
});
test('Twitch requests use anonymous read-only GraphQL without account credentials', async () => {
  const requests = [];
  const h = await setup({ settings: config() }, async (url, options) => {
    requests.push({ url, options });
    return response(live('one'));
  });
  await h.send('CHECK_NOW');
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  assert.equal(url, 'https://gql.twitch.tv/gql');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.headers.Authorization, undefined);
  const query = JSON.parse(options.body)[0];
  assert.equal(query.variables.login, 'example');
  assert.match(query.query, /^query /);
  assert.doesNotMatch(query.query, /mutation|followUser|subscribe/i);
  assert.equal(h.data.channelState['twitch:example'].online, true);
  assert.equal(h.calls.filter(call => call[0] === 'notification').length, 1);
});
test('Twitch batches all channels and continues after a failed batch', async () => {
  const channels = Array.from({ length: 41 }, (_, index) => 'channel' + index);
  const sizes = [];
  const h = await setup({ settings: { ...config(), twitch: channels } }, async (url, options) => {
    const batch = JSON.parse(options.body);
    sizes.push(batch.length);
    if (sizes.length === 2) return new Response('', { status: 429 });
    return response(batch.map(item => live('stream-' + item.variables.login, item.variables.login)[0]));
  });
  await h.send('CHECK_NOW');
  assert.deepEqual(sizes, [20, 20, 1]);
  assert.equal(h.calls.filter(call => call[0] === 'notification').length, 21);
  assert.equal(h.data.channelState['twitch:channel40'].online, true);
  assert.match(h.data.errors[0], /429/);
});
test('invalid Twitch results preserve status while valid channels in the same batch still notify', async () => {
  for (const invalid of [
    { errors: [{ message: 'unavailable' }] },
    { data: { user: null } },
    { data: { user: { login: 'different', stream: null } } },
    { data: { user: { login: 'example' } } },
    { data: { user: { login: 'example', stream: {} } } }
  ]) {
    const previous = { online: true, session: 'old' };
    const h = await setup({ settings: { ...config(), twitch: ['example', 'other'] }, channelState: { 'twitch:example': previous } }, async () => response([invalid, live('new', 'other')[0]]));
    await h.send('CHECK_NOW');
    assert.deepEqual(h.data.channelState['twitch:example'], previous);
    assert.equal(h.data.channelState['twitch:other'].online, true);
    assert.equal(h.calls.filter(call => call[0] === 'notification').length, 1);
    assert.equal(h.data.errors.length, 1);
  }
});
test('malformed Twitch batches do not produce false offline results or alerts', async () => {
  for (const body of [{ data: [] }, [], [live('one')[0], live('two')[0]]]) {
    const previous = { 'twitch:example': { online: true, session: 'old' } };
    const h = await setup({ settings: config(), channelState: previous }, async () => response(body));
    await h.send('CHECK_NOW');
    assert.deepEqual(h.data.channelState, previous);
    assert.equal(h.calls.filter(call => call[0] === 'notification').length, 0);
    assert.equal(h.data.errors.length, 1);
  }
});
test('confirmed offline followed by the same stream does not repeat its alert', async () => {
  let stream = { id: 'one' };
  const h = await setup({ settings: config() }, async () => {
    const body = live('one'); body[0].data.user.stream = stream;
    return response(body);
  });
  await h.send('CHECK_NOW');
  stream = null; await h.send('CHECK_NOW');
  assert.equal(h.data.channelState['twitch:example'].online, false);
  stream = { id: 'one' }; await h.send('CHECK_NOW');
  assert.equal(h.calls.filter(call => call[0] === 'notification').length, 1);
});
test('network errors preserve the previous status and appear in diagnostics', async () => {
  const state = { 'twitch:example': { online: true, session: 'one' } };
  const h = await setup({ settings: config(), channelState: state }, async () => new Response('', { status: 401 }));
  await h.send('CHECK_NOW');
  assert.deepEqual(h.data.channelState, state);
  assert.match(h.data.errors[0], /HTTP 401/);
});
test('background playback mutes the tab before navigation without focusing it', async () => {
  const item = { id: 'notice', url: 'https://www.twitch.tv/example' };
  const h = await setup({ pending: [item] });
  assert.equal((await h.send('OPEN', { id: 'notice', muted: true }, 'https://example.org/')).ok, true);
  assert.deepEqual(h.calls.slice(0, 3), [
    ['tab-create', { url: 'about:blank', active: false }],
    ['tab-update', 42, { muted: true }],
    ['tab-update', 42, { url: item.url }]
  ]);
  assert.deepEqual(h.data.pending, []);
});
test('watch opens an active tab and ignore opens no tabs', async () => {
  const h = await setup({ pending: [{ id: 'one', url: 'https://www.twitch.tv/example' }, { id: 'two' }] });
  await h.send('DISMISS', { id: 'two' });
  assert.equal(h.calls.filter(item => item[0] === 'tab-create').length, 0);
  await h.send('OPEN', { id: 'one', muted: false });
  assert.deepEqual(h.calls.find(item => item[0] === 'tab-create')[1], { url: 'about:blank', active: true });
});
test('ignored alerts can still be opened from the live panel', async () => {
  const item = { platform: 'twitch', channel: 'example', session: 'one', url: 'https://www.twitch.tv/example' };
  const h = await setup({ channelState: { 'twitch:example': { online: true, live: item } }, pending: [] });
  assert.equal((await h.send('OPEN_LIVE', { platform: 'twitch', channel: 'example' })).ok, true);
  assert.equal(h.calls.filter(item => item[0] === 'tab-create').length, 1);
});
test('page scripts cannot read or change settings', async () => {
  const h = await setup({ settings: config() });
  assert.equal((await h.send('GET_STATUS', {}, 'https://example.org')).ok, false);
  assert.equal((await h.send('SAVE_SETTINGS', { settings: DEFAULT_SETTINGS }, 'https://example.org')).ok, false);
  const result = await h.send('GET_STATUS');
  assert.equal('twitchToken' in result.data.settings, false);
  assert.equal('connected' in result.data, false);
  assert.equal('redirectURL' in result.data, false);
});
test('pausing during a lookup prevents a delayed alert', async () => {
  let release;
  const started = new Promise(resolve => { release = resolve; });
  let resolveRequest;
  const h = await setup({ settings: config() }, () => { release(); return new Promise(resolve => { resolveRequest = resolve; }); });
  const check = h.send('CHECK_NOW');
  await started;
  await h.send('SAVE_SETTINGS', { settings: { ...config(), enabled: false } });
  resolveRequest(response(live('one')));
  await check;
  assert.equal(h.calls.filter(item => item[0] === 'notification').length, 0);
});
test('closing a desktop notification dismisses the alert in all tabs', async () => {
  const h = await setup({ pending: [{ id: 'notice' }] });
  h.listeners.closed('notice', true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.data.pending, []);
});
test('updates remove old credentials while preserving lists, preferences, and session state', async () => {
  const previous = { ...config(), youtube: ['@example'], intervalMinutes: 5, inPage: false, twitchClientId: 'old-client', twitchToken: 'old-token' };
  const channelState = { 'twitch:example': { online: true, session: 'one' } };
  const pending = [{ id: 'old-alert' }];
  const h = await setup({ settings: previous, twitchValidatedAt: 1234, channelState, pending });
  await h.listeners.installed();
  assert.deepEqual(h.data.settings, { ...config(), youtube: ['@example'], intervalMinutes: 5, inPage: false });
  assert.equal('twitchValidatedAt' in h.data, false);
  assert.deepEqual(h.data.channelState, channelState);
  assert.deepEqual(h.data.pending, pending);
  assert.equal(h.calls.find(call => call[0] === 'alarm-create')[2].periodInMinutes, 5);
});
test('startup and settings saves discard legacy credentials and unsupported keys', async () => {
  const h = await setup({ settings: { ...config(), twitchToken: 'old-token', twitchClientId: 'old-client' }, twitchValidatedAt: 1 });
  await h.listeners.startup();
  assert.deepEqual(h.data.settings, config());
  assert.equal('twitchValidatedAt' in h.data, false);
  await h.send('SAVE_SETTINGS', { settings: { ...config(), enabled: false, twitchToken: 'injected-token', extra: 'unexpected' } });
  assert.deepEqual(h.data.settings, { ...config(), enabled: false });
  assert.equal((await h.send('CONNECT_TWITCH')).ok, false);
});
test('YouTube lookups identify live streams without duplicate alerts', async () => {
  const player = { videoDetails: { videoId: 'abcdefghijk', author: 'Example', title: 'YouTube live' }, microformat: { playerMicroformatRenderer: { ownerProfileUrl: 'https://www.youtube.com/@example', liveBroadcastDetails: { isLiveNow: true } } } };
  const h = await setup({ settings: { ...DEFAULT_SETTINGS, youtube: ['@example'] } }, async (url, options) => {
    assert.equal(url, 'https://www.youtube.com/%40example/live');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers?.Authorization, undefined);
    return new Response('var ytInitialPlayerResponse = ' + JSON.stringify(player) + ';');
  });
  await h.send('CHECK_NOW'); await h.send('CHECK_NOW');
  assert.equal(h.data.channelState['youtube:@example'].online, true);
  assert.equal(h.calls.filter(item => item[0] === 'notification').length, 1);
});
test('YouTube live tabs check the player and confirm channel ownership', async () => {
  const channelId = 'UC' + 'a'.repeat(22);
  const data = { metadata: { channelMetadataRenderer: { externalId: channelId } }, contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { videoRenderer: { videoId: 'abcdefghijk', badges: [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW' } }] } } } }] } } };
  const player = { videoDetails: { videoId: 'abcdefghijk', channelId, author: 'Example' }, microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true } } } };
  const requests = [];
  const h = await setup({ settings: { ...DEFAULT_SETTINGS, youtube: ['@example'] } }, async url => {
    requests.push(url);
    return new Response(url.includes('/watch?') ? 'var ytInitialPlayerResponse = ' + JSON.stringify(player) : 'var ytInitialData = ' + JSON.stringify(data));
  });
  await h.send('CHECK_NOW');
  assert.equal(requests.length, 2);
  assert.equal(h.data.channelState['youtube:@example'].online, true);
  assert.equal(h.data.errors.length, 0);
});
test('YouTube resolves the handle from the channel page when the player only provides its ID', async () => {
  const channelId = 'UC' + 'a'.repeat(22);
  const player = { videoDetails: { videoId: 'abcdefghijk', channelId, author: 'Example' }, microformat: { playerMicroformatRenderer: { ownerProfileUrl: 'https://www.youtube.com/channel/' + channelId, liveBroadcastDetails: { isLiveNow: true } } } };
  const data = { metadata: { channelMetadataRenderer: { externalId: channelId } } };
  const h = await setup({ settings: { ...DEFAULT_SETTINGS, youtube: ['@example'] } }, async url => new Response(url.endsWith('/live') ? 'var ytInitialPlayerResponse = ' + JSON.stringify(player) : 'var ytInitialData = ' + JSON.stringify(data)));
  await h.send('CHECK_NOW');
  assert.equal(h.data.channelState['youtube:@example'].online, true);
  assert.equal(h.data.errors.length, 0);
});
