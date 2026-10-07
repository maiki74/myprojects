import { DEFAULT_SETTINGS } from './lib.js';
const $ = id => document.getElementById(id);
async function send(type, data = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...data });
  if (!result?.ok) throw new Error(result?.error || 'The extension did not respond.');
  return result.data;
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function readForm() {
  const lines = id => $(id).value.split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
  return {
    twitch: lines('twitch'), youtube: lines('youtube'),
    enabled: $('enabled').checked, inPage: $('in-page').checked, desktop: $('desktop').checked,
    intervalMinutes: Number($('interval').value)
  };
}
async function load() {
  const data = await send('GET_STATUS');
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  $('twitch').value = settings.twitch.join('\n');
  $('youtube').value = settings.youtube.join('\n');
  for (const [id, key] of [['enabled', 'enabled'], ['in-page', 'inPage'], ['desktop', 'desktop']]) $(id).checked = settings[key];
  $('interval').value = settings.intervalMinutes;
}
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { await send('SAVE_SETTINGS', { settings: readForm() }); await load(); status('Settings saved.'); }
  catch (error) { status(error.message, true); }
});
$('test').addEventListener('click', async () => {
  try { await send('TEST_NOTIFICATION'); status('Alert sent. Open a regular web page to try the three buttons.'); }
  catch (error) { status(error.message, true); }
});
load().catch(error => status(error.message, true));
