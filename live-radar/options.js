import { DEFAULT_SETTINGS } from './lib.js';
const $ = id => document.getElementById(id);
async function send(type, data = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...data });
  if (!result?.ok) throw new Error(result?.error || 'A extensão não respondeu.');
  return result.data;
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function readForm() {
  const lines = id => $(id).value.split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
  return {
    twitch: lines('twitch'), youtube: lines('youtube'), twitchClientId: $('client-id').value,
    enabled: $('enabled').checked, inPage: $('in-page').checked, desktop: $('desktop').checked,
    intervalMinutes: Number($('interval').value)
  };
}
async function load(fill = true) {
  const data = await send('GET_STATUS');
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  if (fill) {
    $('twitch').value = settings.twitch.join('\n');
    $('youtube').value = settings.youtube.join('\n');
    $('client-id').value = settings.twitchClientId;
    for (const [id, key] of [['enabled', 'enabled'], ['in-page', 'inPage'], ['desktop', 'desktop']]) $(id).checked = settings[key];
    $('interval').value = settings.intervalMinutes;
  }
  $('redirect-url').value = data.redirectURL;
  $('connection').textContent = data.connected ? 'Conectada' : 'Não conectada';
  $('connection').classList.toggle('connected', data.connected);
  $('disconnect').hidden = !data.connected;
}
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { await send('SAVE_SETTINGS', { settings: readForm() }); await load(); status('Configurações salvas.'); }
  catch (error) { status(error.message, true); }
});
$('connect').addEventListener('click', async () => {
  $('connect').disabled = true;
  status('Aguardando autorização na Twitch…');
  try {
    await send('SAVE_SETTINGS', { settings: readForm() });
    await send('CONNECT_TWITCH');
    await load(false);
    status('Twitch conectada. Monitoramento iniciado.');
  } catch (error) { status(error.message, true); }
  finally { $('connect').disabled = false; }
});
$('disconnect').addEventListener('click', async () => {
  try { await send('DISCONNECT_TWITCH'); await load(false); status('Twitch desconectada.'); }
  catch (error) { status(error.message, true); }
});
$('test').addEventListener('click', async () => {
  try { await send('TEST_NOTIFICATION'); status('Aviso enviado. Abra uma aba comum para ver os três botões.'); }
  catch (error) { status(error.message, true); }
});
load().catch(error => status(error.message, true));
