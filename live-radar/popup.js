const $ = id => document.getElementById(id);
async function send(type, args = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...args });
  if (!result?.ok) throw new Error(result?.error || 'The extension did not respond.');
  return result.data;
}
async function render() {
  const data = await send('GET_STATUS');
  const live = data.settings.enabled ? Object.values(data.channelState || {}).filter(item => item.online && item.live && data.settings[item.live.platform]?.includes(item.live.channel)).map(item => item.live) : [];
  $('count').textContent = String(live.length);
  $('live-list').replaceChildren();
  if (!live.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const hasChannels = data.settings.twitch.length || data.settings.youtube.length;
    empty.textContent = !data.settings.enabled ? 'Monitoring is paused in settings.' : hasChannels ? 'No live streams detected. New alerts will appear here.' : 'Add your streamers in settings to get started.';
    $('live-list').append(empty);
  }
  for (const item of live) {
    const card = document.createElement('div'); card.className = 'live-card';
    const heading = document.createElement('h3'); heading.textContent = item.name + ' · ' + (item.platform === 'twitch' ? 'Twitch' : 'YouTube');
    const title = document.createElement('p'); title.textContent = item.title;
    const row = document.createElement('div'); row.className = 'row';
    for (const [label, muted] of [['Watch', false], ['Background, muted', true]]) {
      const button = document.createElement('button'); button.textContent = label;
      button.addEventListener('click', async () => {
        try { await send('OPEN_LIVE', { platform: item.platform, channel: item.channel, muted }); window.close(); }
        catch (error) { $('errors').textContent = error.message; }
      });
      row.append(button);
    }
    card.append(heading, title, row); $('live-list').append(card);
  }
  $('last-check').textContent = data.lastCheck ? 'Last checked: ' + new Date(data.lastCheck).toLocaleTimeString('en-US') + ' · every ' + data.settings.intervalMinutes + ' min' : 'Waiting for the first check.';
  $('errors').textContent = [...(data.errors || []), ...(data.notificationError ? [data.notificationError] : [])].join('\n');
}
$('check').addEventListener('click', async () => {
  $('check').disabled = true; $('check').textContent = 'Checking…';
  try { await send('CHECK_NOW'); await render(); }
  catch (error) { $('errors').textContent = error.message; }
  finally { $('check').disabled = false; $('check').textContent = 'Check now'; }
});
$('options').addEventListener('click', () => send('OPEN_OPTIONS').catch(error => { $('errors').textContent = error.message; }));
chrome.runtime.onMessage.addListener(message => { if (message.type === 'RADAR_UPDATED') render().catch(() => {}); });
render().catch(error => { $('errors').textContent = error.message; });
