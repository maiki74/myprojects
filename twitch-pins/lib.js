export const MAX_PINS = 50;
export const INTERVAL_MINUTES = 2;
const RESERVED = new Set(['directory', 'downloads', 'jobs', 'p', 'search', 'settings', 'subscriptions', 'turbo', 'videos', 'wallet', 'inventory', 'drops', 'friends', 'messages', 'collections', 'products', 'login', 'signup', 'activate', 'store', 'checkout', 'moderator', 'dashboard', 'broadcast', 'creatorcamp']);

export function normalizeChannel(value) {
  if (typeof value !== 'string') throw new Error('Enter a Twitch channel login or URL.');
  let name = value.trim();
  if (/^https?:\/\//i.test(name)) {
    const url = new URL(name);
    if (!['twitch.tv', 'www.twitch.tv'].includes(url.hostname)) throw new Error('Use a Twitch URL.');
    name = url.pathname.split('/').filter(Boolean)[0] || '';
  }
  name = name.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(name) || RESERVED.has(name)) throw new Error('Invalid channel. Example: alanzoka');
  return name;
}

export function channelFromURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.twitch.tv', 'twitch.tv'].includes(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length || parts.length > 2 || (parts[1] && !['about', 'schedule', 'videos', 'clips', 'collections'].includes(parts[1]))) return null;
    return normalizeChannel(parts[0]);
  } catch { return null; }
}

export function addPin(pins, value, now = Date.now()) {
  const login = normalizeChannel(value);
  if (pins.some(pin => pin.login === login)) return pins;
  if (pins.length >= MAX_PINS) throw new Error(`You can pin up to ${MAX_PINS} channels.`);
  return [{ login, displayName: login, pinnedAt: now }, ...pins];
}

export function movePin(pins, login, direction) {
  const index = pins.findIndex(pin => pin.login === login);
  if (index < 0 || !['up', 'down'].includes(direction)) return pins;
  const target = index + (direction === 'up' ? -1 : 1);
  if (target < 0 || target >= pins.length) return pins;
  const moved = [...pins];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

export function channelStatus(user, now = Date.now()) {
  if (!Object.hasOwn(user, 'stream') || (user.stream !== null && (typeof user.stream !== 'object' || Array.isArray(user.stream)))) throw new Error('Twitch did not return a valid channel status.');
  return {
    displayName: user.displayName || user.login, avatar: user.profileImageURL || '',
    title: user.broadcastSettings?.title || '', online: Boolean(user.stream), checkedAt: now, error: '',
    viewers: user.stream ? Number(user.stream.viewersCount) || 0 : 0,
    game: user.stream?.game?.name || ''
  };
}

export function safeAvatar(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'static-cdn.jtvnw.net' || url.hostname.endsWith('.twitchcdn.net')) ? url.href : '';
  } catch { return ''; }
}
