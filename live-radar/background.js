import { DEFAULT_SETTINGS, validateSettings, youtubeLiveURL, parseYouTubeLive, parseYouTubeChannelPage, transition, safeStreamURL } from './lib.js';

let checkInFlight;
let configurationVersion = 0;
let mutations = Promise.resolve();
function mutate(fn) {
  const result = mutations.then(fn);
  mutations = result.catch(() => {});
  return result;
}
async function settings() {
  return { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get('settings')).settings };
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 401 ? 'Conexão expirada. Conecte a Twitch novamente.' : `Serviço respondeu HTTP ${response.status}.`);
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
        type: 'basic', iconUrl: 'icons/icon128.png', title: `${live.name} entrou ao vivo`,
        message: live.title + '\n' + (live.platform === 'twitch' ? 'Twitch' : 'YouTube'),
        buttons: [{ title: 'Assistir' }, { title: 'De fundo, mudo' }], priority: 1
      });
      await chrome.storage.local.set({ notificationError: '' });
    } catch (error) {
      await chrome.storage.local.set({ notificationError: 'Notificação do sistema: ' + error.message });
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
  if (config.twitch.length) {
    try {
      if (!config.twitchClientId || !config.twitchToken) throw new Error('Adicione o Client ID e conecte sua conta da Twitch nas configurações.');
      // Twitch requires token validation on startup and once per hour.
      const { twitchValidatedAt = 0 } = await chrome.storage.local.get('twitchValidatedAt');
      if (Date.now() - twitchValidatedAt > 3600000) {
        const validation = await (await request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + config.twitchToken } })).json();
        if (validation.client_id !== config.twitchClientId) throw new Error('O token não pertence a este Client ID. Conecte novamente.');
        await chrome.storage.local.set({ twitchValidatedAt: Date.now() });
      }
      const params = new URLSearchParams({ first: '100' });
      config.twitch.forEach(login => params.append('user_login', login));
      const body = await (await request('https://api.twitch.tv/helix/streams?' + params, { headers: { 'Client-ID': config.twitchClientId, Authorization: 'Bearer ' + config.twitchToken } })).json();
      if (!Array.isArray(body.data)) throw new Error('Resposta inesperada da Twitch.');
      for (const channel of config.twitch) {
        const stream = body.data.find(item => item.user_login.toLowerCase() === channel);
        await apply('twitch', channel, stream ? {
          platform: 'twitch', channel, session: stream.id, name: stream.user_name,
          title: stream.title || 'Ao vivo na Twitch', url: 'https://www.twitch.tv/' + channel
        } : null);
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
          if (!expectedId) throw new Error('Não foi possível confirmar o ID do canal. Use a URL /channel/UC… .');
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
  if (!item) throw new Error('Este aviso não está mais disponível.');
  await openStream(item.url, muted);
  await dismiss(id);
}
async function openStream(url, muted) {
  if (!safeStreamURL(url)) throw new Error('Endereço da transmissão inválido.');
  const tab = await chrome.tabs.create({ url: 'about:blank', active: !muted });
  if (muted) await chrome.tabs.update(tab.id, { muted: true });
  await chrome.tabs.update(tab.id, { url });
}
async function connectTwitch() {
  const config = await settings();
  if (!config.twitchClientId) throw new Error('Salve seu Client ID antes de conectar.');
  const state = crypto.randomUUID();
  const redirect = chrome.identity.getRedirectURL('twitch');
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: config.twitchClientId, redirect_uri: redirect, response_type: 'token', state, scope: '', force_verify: 'true' });
  const callback = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
  if (!callback || new URL(callback).origin !== new URL(redirect).origin || new URL(callback).pathname !== new URL(redirect).pathname) throw new Error('Resposta de autenticação inválida.');
  const params = new URLSearchParams(new URL(callback).hash.slice(1));
  if (params.get('state') !== state || !params.get('access_token')) throw new Error('Conexão cancelada ou não autorizada.');
  const token = params.get('access_token');
  const validation = await (await request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + token } })).json();
  if (validation.client_id !== config.twitchClientId) throw new Error('Client ID não corresponde à conexão.');
  await mutate(async () => {
    const current = await settings();
    if (current.twitchClientId !== config.twitchClientId) throw new Error('O Client ID mudou durante a conexão. Tente novamente.');
    await chrome.storage.local.set({ settings: { ...current, twitchToken: token }, twitchValidatedAt: Date.now() });
    configurationVersion++;
  });
  await checkNow();
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
  if (!privileged) throw new Error('Ação indisponível nesta página.');
  if (message.type === 'OPEN_LIVE') {
    const { channelState = {} } = await chrome.storage.local.get('channelState');
    const item = channelState[`${message.platform}:${message.channel}`];
    if (!item?.online || !item.live) throw new Error('Esta transmissão não está mais disponível.');
    await openStream(item.live.url, Boolean(message.muted));
    await dismiss(`${item.live.platform}:${item.live.channel}:${item.live.session}`);
    return;
  }
  if (message.type === 'GET_STATUS') {
    const config = await settings();
    const { twitchToken, ...publicSettings } = config;
    const data = await chrome.storage.local.get(['channelState', 'errors', 'lastCheck', 'notificationError']);
    return { ...data, settings: publicSettings, connected: Boolean(twitchToken), redirectURL: chrome.identity.getRedirectURL('twitch') };
  }
  if (message.type === 'SAVE_SETTINGS') {
    await mutate(async () => {
      const current = await settings();
      const next = validateSettings(message.settings, current);
      await chrome.storage.local.set({ settings: next });
      configurationVersion++;
      if (next.twitchClientId !== current.twitchClientId) await chrome.storage.local.set({ twitchValidatedAt: 0 });
    });
    await schedule();
    await broadcast();
    checkNow().catch(console.error);
    return;
  }
  if (message.type === 'CONNECT_TWITCH') return connectTwitch();
  if (message.type === 'DISCONNECT_TWITCH') {
    await mutate(async () => {
      const config = await settings();
      if (config.twitchToken) {
        await request('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.twitchClientId, token: config.twitchToken }) });
      }
      await chrome.storage.local.set({ settings: { ...config, twitchToken: '' }, twitchValidatedAt: 0 });
      configurationVersion++;
    });
    return;
  }
  if (message.type === 'CHECK_NOW') return checkNow();
  if (message.type === 'TEST_NOTIFICATION') {
    const config = await settings();
    await addNotification({ platform: 'twitch', channel: 'twitch', session: 'test-' + Date.now(), name: 'Live Radar · teste', title: 'Seus avisos estão prontos. Este teste abre o canal Twitch.', url: 'https://www.twitch.tv/twitch', test: true }, config);
    await broadcast();
    return;
  }
  if (message.type === 'OPEN_OPTIONS') return chrome.runtime.openOptionsPage();
  throw new Error('Ação desconhecida.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'live-check') checkNow().catch(console.error); });
chrome.runtime.onInstalled.addListener(() => schedule().catch(console.error));
chrome.runtime.onStartup.addListener(async () => { await chrome.storage.local.set({ twitchValidatedAt: 0 }); await schedule(); });
chrome.notifications.onButtonClicked.addListener((id, index) => openNotification(id, index === 1).catch(console.error));
chrome.notifications.onClicked.addListener(id => openNotification(id, false).catch(console.error));
chrome.notifications.onClosed.addListener((id, byUser) => { if (byUser) dismiss(id, false).catch(console.error); });
