import { cleanSettings, validateSettings, parseTwitchLive, youtubeLiveURL, parseYouTubeLive, parseYouTubeChannelPage, transition, safeStreamURL } from './lib.js';

// Public website identifier, not a personal token or an application secret.
const WEBSITE_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const TWITCH_QUERY = 'query RadarChannel($login: String!) { user(login: $login) { login displayName broadcastSettings { title } stream { id } } }';

let checkInFlight;
let configurationVersion = 0;
let mutations = Promise.resolve();
function mutate(fn) {
  const result = mutations.then(fn);
  mutations = result.catch(() => {});
  return result;
}
async function settings() {
  return cleanSettings((await chrome.storage.local.get('settings')).settings);
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Service returned HTTP ${response.status}.`);
  return response;
}
async function schedule() {
  const config = await settings();
  await chrome.alarms.clear('live-check');
  if (config.enabled) await chrome.alarms.create('live-check', { periodInMinutes: config.intervalMinutes, delayInMinutes: 0.1 });
  else await chrome.action.setBadgeText({ text: '' });
}
async function broadcast() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'RADAR_UPDATED' }).catch(() => {})));
}
async function addNotification(live, config) {
  const id = `${live.platform}:${live.channel}:${live.session}`;
  await mutate(async () => {
    const { pending = [] } = await chrome.storage.local.get('pending');
    if (pending.some(item => item.id === id)) return;
    await chrome.storage.local.set({ pending: [...pending.filter(item => Date.now() - item.createdAt < 21600000), { ...live, id, createdAt: Date.now() }].slice(-20) });
  });
  if (config.desktop) {
    try {
      await chrome.notifications.create(id, {
        type: 'basic', iconUrl: 'icons/icon128.png', title: `${live.name} is live`,
        message: live.title + '\n' + (live.platform === 'twitch' ? 'Twitch' : 'YouTube'),
        buttons: [{ title: 'Watch' }, { title: 'Background, muted' }], priority: 1
      });
      await chrome.storage.local.set({ notificationError: '' });
    } catch (error) {
      await chrome.storage.local.set({ notificationError: 'Desktop notification: ' + error.message });
    }
  }
}
async function checkNow() {
  if (checkInFlight) return checkInFlight;
  checkInFlight = (async () => { while (await doCheck()) { /* Reconcile changes made during a request. */ } })().finally(() => { checkInFlight = null; });
  return checkInFlight;
}
async function doCheck() {
  const version = configurationVersion;
  const config = await settings();
  if (!config.enabled) return;
  const { channelState = {} } = await chrome.storage.local.get('channelState');
  const state = {};
  for (const platform of ['twitch', 'youtube']) for (const channel of config[platform]) {
    const key = `${platform}:${channel}`;
    if (channelState[key]) state[key] = channelState[key];
  }
  const errors = [];
  const apply = async (platform, channel, live) => {
    if (version !== configurationVersion) return;
    const key = `${platform}:${channel}`;
    const next = transition(state[key], live);
    state[key] = { ...next.state, checkedAt: Date.now() };
    if (next.notify) await addNotification(live, config);
  };
  for (let offset = 0; offset < config.twitch.length; offset += 20) {
    const batch = config.twitch.slice(offset, offset + 20);
    try {
      const body = await (await request('https://gql.twitch.tv/gql', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Client-ID': WEBSITE_CLIENT_ID },
        body: JSON.stringify(batch.map(channel => ({ operationName: 'RadarChannel', variables: { login: channel }, query: TWITCH_QUERY })))
      })).json();
      if (!Array.isArray(body) || body.length !== batch.length) throw new Error('Unexpected Twitch response.');
      for (const [index, channel] of batch.entries()) {
        try { await apply('twitch', channel, parseTwitchLive(body[index], channel)); }
        catch (error) { errors.push(`Twitch (${channel}): ${error.message}`); }
      }
    } catch (error) { errors.push('Twitch: ' + error.message); }
  }
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, config.youtube.length) }, async () => {
    while (index < config.youtube.length) {
      const channel = config.youtube[index++];
      try {
        const html = await (await request(youtubeLiveURL(channel))).text();
        let info = parseYouTubeChannelPage(html);
        let live;
        try { live = parseYouTubeLive(html, channel, info.channelId); }
        catch (error) {
          if (error.code !== 'YOUTUBE_OWNER_UNCONFIRMED' || !channel.startsWith('@')) throw error;
          const baseURL = youtubeLiveURL(channel).replace(/\/live$/, '');
          info = parseYouTubeChannelPage(await (await request(baseURL)).text());
          if (!info.channelId) throw error;
          live = parseYouTubeLive(html, channel, info.channelId);
        }
        // Some channels show a live tab instead of redirecting straight to the player.
        if (!live && info.liveVideoId) {
          const expectedId = channel.startsWith('UC') ? channel : info.channelId;
          if (!expectedId) throw new Error('Could not confirm the channel ID. Use its /channel/UC… URL.');
          const watchHTML = await (await request('https://www.youtube.com/watch?v=' + info.liveVideoId)).text();
          live = parseYouTubeLive(watchHTML, channel, expectedId);
        }
        await apply('youtube', channel, live);
      } catch (error) { errors.push(`YouTube (${channel}): ${error.message}`); }
    }
  }));
  if (version !== configurationVersion) return true;
  await chrome.storage.local.set({ channelState: state, lastCheck: Date.now(), errors });
  const count = Object.values(state).filter(item => item.online).length;
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#8954ff' });
  await broadcast();
}
async function dismiss(id, clear = true) {
  await mutate(async () => {
    const { pending = [] } = await chrome.storage.local.get('pending');
    await chrome.storage.local.set({ pending: pending.filter(item => item.id !== id) });
  });
  if (clear) await chrome.notifications.clear(id);
  await broadcast();
}
async function openNotification(id, muted) {
  const { pending = [] } = await chrome.storage.local.get('pending');
  const item = pending.find(entry => entry.id === id);
  if (!item) throw new Error('This alert is no longer available.');
  await openStream(item.url, muted);
  await dismiss(id);
}
async function openStream(url, muted) {
  if (!safeStreamURL(url)) throw new Error('Invalid stream URL.');
  const tab = await chrome.tabs.create({ url: 'about:blank', active: !muted });
  if (muted) await chrome.tabs.update(tab.id, { muted: true });
  await chrome.tabs.update(tab.id, { url });
}
async function handle(message, sender) {
  if (message.type === 'GET_PENDING') {
    const config = await settings();
    const { pending = [] } = await chrome.storage.local.get('pending');
    return { pending: config.enabled && config.inPage ? pending.filter(item => Date.now() - item.createdAt < 21600000 && (item.test || config[item.platform]?.includes(item.channel))) : [] };
  }
  if (message.type === 'DISMISS') return dismiss(message.id);
  if (message.type === 'OPEN') return openNotification(message.id, Boolean(message.muted));
  const privileged = sender.url?.startsWith(chrome.runtime.getURL(''));
  if (!privileged) throw new Error('This action is unavailable on this page.');
  if (message.type === 'OPEN_LIVE') {
    const { channelState = {} } = await chrome.storage.local.get('channelState');
    const item = channelState[`${message.platform}:${message.channel}`];
    if (!item?.online || !item.live) throw new Error('This stream is no longer available.');
    await openStream(item.live.url, Boolean(message.muted));
    await dismiss(`${item.live.platform}:${item.live.channel}:${item.live.session}`);
    return;
  }
  if (message.type === 'GET_STATUS') {
    const config = await settings();
    const data = await chrome.storage.local.get(['channelState', 'errors', 'lastCheck', 'notificationError']);
    return { ...data, settings: config };
  }
  if (message.type === 'SAVE_SETTINGS') {
    await mutate(async () => {
      const current = await settings();
      const next = validateSettings(message.settings, current);
      await chrome.storage.local.set({ settings: next });
      configurationVersion++;
    });
    await schedule();
    await broadcast();
    checkNow().catch(console.error);
    return;
  }
  if (message.type === 'CHECK_NOW') return checkNow();
  if (message.type === 'TEST_NOTIFICATION') {
    const config = await settings();
    await addNotification({ platform: 'twitch', channel: 'twitch', session: 'test-' + Date.now(), name: 'Live Radar · test', title: 'Your alerts are ready. This test opens the Twitch channel.', url: 'https://www.twitch.tv/twitch', test: true }, config);
    await broadcast();
    return;
  }
  if (message.type === 'OPEN_OPTIONS') return chrome.runtime.openOptionsPage();
  throw new Error('Unknown action.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'live-check') checkNow().catch(console.error); });
async function initialize() {
  await mutate(async () => {
    await chrome.storage.local.set({ settings: await settings() });
    await chrome.storage.local.remove('twitchValidatedAt');
  });
  await schedule();
}
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.notifications.onButtonClicked.addListener((id, index) => openNotification(id, index === 1).catch(console.error));
chrome.notifications.onClicked.addListener(id => openNotification(id, false).catch(console.error));
chrome.notifications.onClosed.addListener((id, byUser) => { if (byUser) dismiss(id, false).catch(console.error); });
