import { safeAvatar } from './lib.js';
const $ = id => document.getElementById(id);
let data = { pins: [], channelState: {} };
async function send(type, args = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...args });
  if (!response?.ok) throw new Error(response?.error || 'A extensão não respondeu.');
  return response.data;
}
function feedback(text, error = false) { $('feedback').textContent = text; $('feedback').classList.toggle('error', error); }
async function action(type, args = {}) {
  try { data = await send(type, args); render(); feedback(type === 'UNPIN' ? 'Canal removido dos fixados.' : 'Lista atualizada.'); }
  catch (error) { feedback(error.message, true); }
}
function render() {
  $('total').textContent = data.pins.length + '/50';
  $('list').replaceChildren();
  if (!data.pins.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const strong = document.createElement('strong'); strong.textContent = 'Dê uma chance a um novo canal.';
    empty.append(strong, document.createTextNode('Fixe aqui ou pelo botão na página do streamer. Não é necessário seguir nem dar sub.'));
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
    indicator.textContent = status.error ? 'Indisponível' : status.online === true ? '● Ao vivo' : status.online === false ? 'Offline' : 'Verificando…';
    top.append(avatar, identity, indicator);
    const metadata = document.createElement('p'); metadata.className = 'metadata';
    metadata.hidden = !status.online;
    if (status.online) metadata.textContent = new Intl.NumberFormat('pt-BR').format(status.viewers || 0) + ' espectadores · ' + (status.game || 'Categoria não informada');
    metadata.title = metadata.textContent;
    const title = document.createElement('p'); title.className = 'title'; title.textContent = status.error || (status.online ? status.title || status.game : '') || '';
    title.title = title.textContent;
    const actions = document.createElement('div'); actions.className = 'actions';
    const open = document.createElement('button'); open.textContent = 'Abrir canal'; open.addEventListener('click', () => send('OPEN_CHANNEL', { login: pin.login }).catch(error => feedback(error.message, true)));
    const up = document.createElement('button'); up.textContent = '↑'; up.title = 'Mover ' + name + ' para cima'; up.setAttribute('aria-label', up.title); up.disabled = index === 0; up.addEventListener('click', () => action('MOVE', { login: pin.login, direction: 'up' }));
    const down = document.createElement('button'); down.textContent = '↓'; down.title = 'Mover ' + name + ' para baixo'; down.setAttribute('aria-label', down.title); down.disabled = index === data.pins.length - 1; down.addEventListener('click', () => action('MOVE', { login: pin.login, direction: 'down' }));
    const remove = document.createElement('button'); remove.textContent = 'Desafixar'; remove.className = 'remove'; remove.setAttribute('aria-label', 'Desafixar ' + name); remove.addEventListener('click', () => action('UNPIN', { login: pin.login }));
    actions.append(open, up, down, remove);
    card.append(top, metadata, title, actions); $('list').append(card);
  });
  $('last-update').textContent = data.lastAttempt ? 'Última consulta: ' + new Date(data.lastAttempt).toLocaleTimeString('pt-BR') + (data.error ? ' · houve erros; último estado conhecido.' : '') : 'Os status são consultados a cada 2 minutos.';
  if (data.error) feedback(data.error, true);
}
$('add-form').addEventListener('submit', async event => {
  event.preventDefault(); $('add').disabled = true;
  try { data = await send('PIN', { login: $('channel').value }); $('channel').value = ''; render(); feedback('Canal fixado sem seguir.'); }
  catch (error) { feedback(error.message, true); }
  finally { $('add').disabled = false; }
});
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true; $('refresh').textContent = 'Atualizando…';
  try { data = await send('REFRESH'); render(); if (!data.error) feedback('Status atualizados.'); }
  catch (error) { feedback(error.message, true); }
  finally { $('refresh').disabled = false; $('refresh').textContent = '↻ Atualizar'; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of ['pins', 'channelState', 'lastAttempt', 'lastSuccess', 'error']) if (changes[key]) data[key] = changes[key].newValue || (key === 'pins' ? [] : key === 'channelState' ? {} : '');
  render();
});
send('GET_STATE').then(result => { data = result; render(); }).catch(error => feedback(error.message, true));
