import { safeAvatar } from './lib.js';
const $ = id => document.getElementById(id);
let data = { pins: [], channelState: {} };
async function send(type, args = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...args });
  if (!response?.ok) throw new Error(response?.error || 'The extension did not respond.');
  return response.data;
}
function feedback(text, error = false) { $('feedback').textContent = text; $('feedback').classList.toggle('error', error); }
async function action(type, args = {}) {
  try { data = await send(type, args); render(); feedback(type === 'UNPIN' ? 'Channel unpinned.' : 'List updated.'); }
  catch (error) { feedback(error.message, true); }
}
function render() {
  $('total').textContent = data.pins.length + '/50';
  $('list').replaceChildren();
  if (!data.pins.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const strong = document.createElement('strong'); strong.textContent = 'Give a new channel a try.';
    empty.append(strong, document.createTextNode('Pin a channel here or from its page. No follow or subscription needed.'));
    $('list').append(empty);
  }
  data.pins.forEach((pin, index) => {
    const status = data.channelState[pin.login] || {};
    const name = status.displayName || pin.displayName || pin.login;
    const card = document.createElement('section'); card.className = 'card';
    const top = document.createElement('div'); top.className = 'card-top';
    const avatar = document.createElement('div'); avatar.className = 'avatar';
    const avatarURL = safeAvatar(status.avatar);
    if (avatarURL) { const img = document.createElement('img'); img.src = avatarURL; img.alt = ''; img.addEventListener('error', () => { avatar.textContent = name.slice(0, 2).toUpperCase(); }, { once: true }); avatar.append(img); }
    else avatar.textContent = name.slice(0, 2).toUpperCase();
    const identity = document.createElement('div'); identity.className = 'identity';
    const heading = document.createElement('h3'); heading.textContent = name;
    identity.append(heading);
    const indicator = document.createElement('span'); indicator.className = 'state' + (status.error ? ' error' : status.online ? ' live' : '');
    indicator.textContent = status.error ? 'Unavailable' : status.online === true ? '● Live' : status.online === false ? 'Offline' : 'Checking…';
    top.append(avatar, identity, indicator);
    const metadata = document.createElement('p'); metadata.className = 'metadata';
    metadata.hidden = !status.online;
    if (status.online) metadata.textContent = new Intl.NumberFormat('en-US').format(status.viewers || 0) + ' viewers · ' + (status.game || 'Category unavailable');
    metadata.title = metadata.textContent;
    const title = document.createElement('p'); title.className = 'title'; title.textContent = status.error || (status.online ? status.title || status.game : '') || '';
    title.title = title.textContent;
    const actions = document.createElement('div'); actions.className = 'actions';
    const open = document.createElement('button'); open.textContent = 'Open channel'; open.addEventListener('click', () => send('OPEN_CHANNEL', { login: pin.login }).catch(error => feedback(error.message, true)));
    const up = document.createElement('button'); up.textContent = '↑'; up.title = 'Move ' + name + ' up'; up.setAttribute('aria-label', up.title); up.disabled = index === 0; up.addEventListener('click', () => action('MOVE', { login: pin.login, direction: 'up' }));
    const down = document.createElement('button'); down.textContent = '↓'; down.title = 'Move ' + name + ' down'; down.setAttribute('aria-label', down.title); down.disabled = index === data.pins.length - 1; down.addEventListener('click', () => action('MOVE', { login: pin.login, direction: 'down' }));
    const remove = document.createElement('button'); remove.textContent = 'Unpin'; remove.className = 'remove'; remove.setAttribute('aria-label', 'Unpin ' + name); remove.addEventListener('click', () => action('UNPIN', { login: pin.login }));
    actions.append(open, up, down, remove);
    card.append(top, metadata, title, actions); $('list').append(card);
  });
  $('last-update').textContent = data.lastAttempt ? 'Last checked: ' + new Date(data.lastAttempt).toLocaleTimeString('en-US') + (data.error ? ' · errors occurred; showing the last known status.' : '') : 'Channel status is checked every 2 minutes.';
  if (data.error) feedback(data.error, true);
}
$('add-form').addEventListener('submit', async event => {
  event.preventDefault(); $('add').disabled = true;
  try { data = await send('PIN', { login: $('channel').value }); $('channel').value = ''; render(); feedback('Channel pinned without following.'); }
  catch (error) { feedback(error.message, true); }
  finally { $('add').disabled = false; }
});
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true; $('refresh').textContent = 'Refreshing…';
  try { data = await send('REFRESH'); render(); if (!data.error) feedback('Status refreshed.'); }
  catch (error) { feedback(error.message, true); }
  finally { $('refresh').disabled = false; $('refresh').textContent = '↻ Refresh'; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of ['pins', 'channelState', 'lastAttempt', 'lastSuccess', 'error']) if (changes[key]) data[key] = changes[key].newValue || (key === 'pins' ? [] : key === 'channelState' ? {} : '');
  render();
});
send('GET_STATE').then(result => { data = result; render(); }).catch(error => feedback(error.message, true));
