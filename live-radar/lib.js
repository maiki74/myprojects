export const DEFAULT_SETTINGS = {
  twitch: [], youtube: [],
  intervalMinutes: 2, inPage: true, desktop: true, enabled: true
};

export function cleanSettings(previous = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => [key, previous[key] ?? fallback]));
}

export function normalizeTwitch(value) {
  const raw = value.trim();
  let name = raw;
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (!['twitch.tv', 'www.twitch.tv'].includes(url.hostname)) throw new Error('Use a Twitch channel.');
    name = url.pathname.split('/').filter(Boolean)[0] || '';
  }
  name = name.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(name)) throw new Error('Invalid Twitch login. Example: alanzoka');
  return name;
}

export function normalizeYouTube(value) {
  let name = value.trim();
  if (/^https?:\/\//i.test(name)) {
    const url = new URL(name);
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) throw new Error('Use a YouTube channel.');
    const path = decodeURIComponent(url.pathname).split('/').filter(Boolean);
    if (path[0] !== 'channel' && !path[0]?.startsWith('@')) throw new Error('Use a channel URL, rather than a video URL.');
    name = path[0] === 'channel' ? path[1] || '' : path[0] || '';
  }
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(name)) return name;
  name = name.startsWith('@') ? name : '@' + name;
  if (!/^@[\p{L}\p{N}_.\-·]{3,30}$/u.test(name)) throw new Error('Use the channel @handle or /channel/UC… URL.');
  return name.toLowerCase();
}

export function youtubeLiveURL(channel) {
  return 'https://www.youtube.com/' + (channel.startsWith('UC') ? 'channel/' : '') + encodeURIComponent(channel) + '/live';
}

export function validateSettings(input, previous = DEFAULT_SETTINGS) {
  const settings = cleanSettings(previous);
  for (const [key, normalize] of [['twitch', normalizeTwitch], ['youtube', normalizeYouTube]]) {
    if (!Array.isArray(input[key]) || input[key].length > 100) throw new Error('The limit is 100 channels per platform.');
    settings[key] = [...new Set(input[key].map(normalize))];
  }
  const interval = Number(input.intervalMinutes);
  if (!Number.isFinite(interval) || interval < 1 || interval > 60) throw new Error('Use an interval between 1 and 60 minutes.');
  settings.intervalMinutes = interval;
  for (const key of ['inPage', 'desktop', 'enabled']) settings[key] = Boolean(input[key]);
  return settings;
}

export function parseTwitchLive(result, channel) {
  if (!result || result.errors?.length) throw new Error('The public Twitch lookup is unavailable.');
  const user = result.data?.user;
  if (!user) throw new Error('Channel not found on Twitch.');
  if (typeof user.login !== 'string' || user.login.toLowerCase() !== channel) throw new Error('Twitch returned a different channel.');
  if (!Object.hasOwn(user, 'stream')) throw new Error('Twitch did not return a valid channel status.');
  if (user.stream === null) return null;
  if (typeof user.stream !== 'object' || Array.isArray(user.stream) || typeof user.stream.id !== 'string' || !user.stream.id.trim()) {
    throw new Error('Twitch did not return a valid stream ID.');
  }
  return {
    platform: 'twitch', channel, session: user.stream.id,
    name: user.displayName || channel, title: user.broadcastSettings?.title || 'Live on Twitch',
    url: 'https://www.twitch.tv/' + channel
  };
}

// Read JSON objects from HTML without executing page scripts.
export function extractJSON(html, name) {
  const pattern = new RegExp('(?:\\b' + name + '\\b|window\\[\\s*["\x27]' + name + '["\x27]\\s*\\])\\s*=\\s*', 'g');
  for (const match of html.matchAll(pattern)) {
    const start = match.index + match[0].length;
    if (html[start] !== '{') continue;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

export function parseYouTubeChannelPage(html) {
  const data = extractJSON(html, 'ytInitialData');
  const externalId = data?.metadata?.channelMetadataRenderer?.externalId;
  const channelId = /^UC[a-zA-Z0-9_-]{22}$/.test(externalId || '') ? externalId : null;
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
  const content = tabs.find(tab => tab.tabRenderer?.selected)?.tabRenderer?.content;
  const queue = content ? [content] : [];
  while (queue.length) {
    const value = queue.pop();
    if (!value || typeof value !== 'object') continue;
    const video = value.videoRenderer || value.gridVideoRenderer;
    if (video && !video.upcomingEventData && /^[a-zA-Z0-9_-]{11}$/.test(video.videoId || '')) {
      const live = video.badges?.some(badge => badge.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW') ||
        video.thumbnailOverlays?.some(overlay => overlay.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE');
      if (live) return { channelId, liveVideoId: video.videoId };
    }
    queue.push(...Object.values(value));
  }
  return { channelId, liveVideoId: null };
}

export function parseYouTubeLive(html, channel, resolvedChannelId = null) {
  const player = extractJSON(html, 'ytInitialPlayerResponse');
  if (!player) {
    if (extractJSON(html, 'ytInitialData')) return null;
    throw new Error('YouTube did not provide channel data (access blocked, consent required, or page format changed).');
  }
  const details = player.videoDetails || {};
  const micro = player.microformat?.playerMicroformatRenderer || {};
  const live = micro.liveBroadcastDetails;
  if (live?.isLiveNow !== true) {
    if (['ERROR', 'LOGIN_REQUIRED', 'UNPLAYABLE'].includes(player.playabilityStatus?.status)) {
      throw new Error('Could not verify this channel: ' + (player.playabilityStatus.reason || 'video unavailable'));
    }
    return null;
  }
  if (channel.startsWith('UC') || resolvedChannelId) {
    if (details.channelId !== (resolvedChannelId || channel)) throw new Error('YouTube returned a stream from a different channel.');
  } else {
    const owner = micro.ownerProfileUrl || '';
    let ownerPath = '';
    try { ownerPath = decodeURIComponent(new URL(owner).pathname).replace(/\/$/, '').toLowerCase(); } catch {}
    if (ownerPath !== '/' + channel.toLowerCase()) {
      const error = new Error('YouTube could not confirm the stream owner. Use the /channel/UC… URL for this channel.');
      error.code = 'YOUTUBE_OWNER_UNCONFIRMED';
      throw error;
    }
  }
  if (!/^[a-zA-Z0-9_-]{11}$/.test(details.videoId || '')) throw new Error('Invalid stream ID.');
  return {
    platform: 'youtube', channel, session: details.videoId,
    name: details.author || channel, title: details.title || 'Live on YouTube',
    url: 'https://www.youtube.com/watch?v=' + details.videoId
  };
}

export function transition(previous, live) {
  if (!live) return { state: { ...previous, online: false }, notify: false };
  return { state: { online: true, session: live.session, live }, notify: previous?.session !== live.session };
}

export function safeStreamURL(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (
      (u.hostname === 'www.twitch.tv' && /^\/[a-z0-9_]{1,25}$/.test(u.pathname)) ||
      (u.hostname === 'www.youtube.com' && u.pathname === '/watch' && /^[a-zA-Z0-9_-]{11}$/.test(u.searchParams.get('v') || ''))
    );
  } catch { return false; }
}
