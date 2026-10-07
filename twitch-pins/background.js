import { INTERVAL_MINUTES, normalizeChannel, addPin, movePin, channelStatus } from './lib.js';

// Public identifier used by Twitch's own website, not a user token or Client Secret.
// This read-only website endpoint is unofficial and may change without notice.
const WEBSITE_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const QUERY = 'query PinnedChannel($login: String!) { user(login: $login) { login displayName profileImageURL(width: 70) broadcastSettings { title } stream { viewersCount game { name } } } }';
let queue = Promise.resolve();
let refreshing;
function mutate(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}
async function read() {
  const { pins = [], channelState = {}, lastAttempt = 0, lastSuccess = 0, error = '', sidebarCollapsed = false } = await chrome.storage.local.get(['pins', 'channelState', 'lastAttempt', 'lastSuccess', 'error', 'sidebarCollapsed']);
  const cleanState = Object.fromEntries(Object.entries(channelState).map(([login, entry]) => {
    const { history, session, ...status } = entry;
    return [login, status];
  }));
  return { pins, channelState: cleanState, lastAttempt, lastSuccess, error, sidebarCollapsed };
}
async function schedule() {
  const { pins, channelState } = await read();
  await chrome.alarms.clear('pins-refresh');
  if (pins.length) await chrome.alarms.create('pins-refresh', { periodInMinutes: INTERVAL_MINUTES, delayInMinutes: 0.1 });
  const count = pins.filter(pin => channelState[pin.login]?.online && !channelState[pin.login]?.error).length;
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });
}
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = doRefresh().finally(() => { refreshing = null; });
  return refreshing;
}
async function doRefresh() {
  const { pins } = await read();
  if (!pins.length) return;
  const updates = {};
  const errors = [];
  for (let offset = 0; offset < pins.length; offset += 20) {
    const batch = pins.slice(offset, offset + 20);
    try {
      const response = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'Client-ID': WEBSITE_CLIENT_ID },
        body: JSON.stringify(batch.map(pin => ({ operationName: 'PinnedChannel', variables: { login: pin.login }, query: QUERY })))
      });
      if (!response.ok) throw new Error(`Twitch returned HTTP ${response.status}.`);
      const body = await response.json();
      if (!Array.isArray(body) || body.length !== batch.length) throw new Error('Twitch returned an unexpected response.');
      batch.forEach((pin, index) => {
        const result = body[index];
        if (result.errors?.length) {
          updates[pin.login] = { error: 'The public Twitch lookup is unavailable.' };
          errors.push(pin.login + ': lookup unavailable');
        } else if (!result.data?.user) {
          updates[pin.login] = { error: 'Channel not found on Twitch.' };
          errors.push(pin.login + ': channel not found');
        } else if (result.data.user.login?.toLowerCase() !== pin.login) {
          updates[pin.login] = { error: 'Twitch returned a different channel.' };
          errors.push(pin.login + ': response from a different channel');
        } else updates[pin.login] = { user: result.data.user };
      });
    } catch (error) {
      for (const pin of batch) updates[pin.login] = { error: error.message };
      errors.push(error.message);
    }
  }
  await mutate(async () => {
    const current = await read();
    const state = {};
    const now = Date.now();
    for (const pin of current.pins) {
      const old = current.channelState[pin.login];
      const update = updates[pin.login];
      if (!update) { if (old) state[pin.login] = old; continue; }
      try {
        state[pin.login] = update.user ? channelStatus(update.user, now) : { ...old, error: update.error };
      } catch (error) { state[pin.login] = { ...old, error: error.message }; errors.push(pin.login + ': ' + error.message); }
    }
    const patch = { channelState: state, lastAttempt: now, error: [...new Set(errors)].join('\n') };
    if (!errors.length) patch.lastSuccess = now;
    await chrome.storage.local.set(patch);
    const count = Object.values(state).filter(item => item.online && !item.error).length;
    await chrome.action.setBadgeText({ text: count ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#a66fff' });
  });
}
async function handle(message, sender) {
  const url = sender.url || '';
  let trusted = url.startsWith(chrome.runtime.getURL(''));
  if (!trusted) {
    try { const site = new URL(url); trusted = site.protocol === 'https:' && ['www.twitch.tv', 'twitch.tv'].includes(site.hostname); } catch {}
  }
  if (!trusted) throw new Error('This action is only available on Twitch and in the extension panel.');
  if (message.type === 'GET_STATE') return read();
  if (message.type === 'SET_SIDEBAR_COLLAPSED') {
    if (typeof message.collapsed !== 'boolean') throw new Error('Invalid list state.');
    await mutate(() => chrome.storage.local.set({ sidebarCollapsed: message.collapsed }));
    return read();
  }
  if (message.type === 'REFRESH') { await refresh(); return read(); }
  if (message.type === 'OPEN_CHANNEL') {
    const login = normalizeChannel(message.login);
    return chrome.tabs.create({ url: 'https://www.twitch.tv/' + login });
  }
  if (message.type === 'OPEN_PANEL') return chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  if (message.type === 'PIN') {
    await mutate(async () => {
      const data = await read();
      await chrome.storage.local.set({ pins: addPin(data.pins, message.login) });
    });
    await schedule();
    // Repeat after any old in-flight request so a just-added pin is also queried.
    if (refreshing) refreshing.then(() => refresh()).catch(console.error);
    else refresh().catch(console.error);
    return read();
  }
  if (message.type === 'UNPIN') {
    const login = normalizeChannel(message.login);
    await mutate(async () => {
      const data = await read();
      const pins = data.pins.filter(pin => pin.login !== login);
      const channelState = { ...data.channelState };
      delete channelState[login];
      await chrome.storage.local.set({ pins, channelState });
    });
    await schedule();
    return read();
  }
  if (message.type === 'MOVE') {
    const login = normalizeChannel(message.login);
    await mutate(async () => {
      const { pins } = await read();
      await chrome.storage.local.set({ pins: movePin(pins, login, message.direction) });
    });
    return read();
  }
  throw new Error('Unknown action.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => mutate(async () => {
  const { channelState } = await read();
  await chrome.storage.local.set({ channelState });
}).then(schedule).catch(console.error));
chrome.runtime.onStartup.addListener(async () => { await schedule(); refresh().catch(console.error); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'pins-refresh') refresh().catch(console.error); });
