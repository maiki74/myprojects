import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeTwitch, normalizeYouTube, youtubeLiveURL, extractJSON, parseYouTubeLive, parseYouTubeChannelPage, transition, safeStreamURL, validateSettings } from '../lib.js';

const channelId = 'UC' + 'a'.repeat(22);
const videoId = 'abcdefghijk';
function page(overrides = {}) {
  return 'var ytInitialPlayerResponse = ' + JSON.stringify({
    videoDetails: { videoId, channelId, author: 'Canal exemplo', title: 'Título com } e "aspas"' },
    microformat: { playerMicroformatRenderer: { ownerProfileUrl: 'https://www.youtube.com/@exemplo', liveBroadcastDetails: { isLiveNow: true } } },
    ...overrides
  }) + ';';
}
test('normaliza logins e URLs Twitch e rejeita domínios falsos', () => {
  assert.equal(normalizeTwitch('https://www.twitch.tv/Alanzoka?x=1'), 'alanzoka');
  assert.equal(normalizeTwitch('@Gaules'), 'gaules');
  assert.throws(() => normalizeTwitch('https://twitch.tv.evil.test/test'));
  assert.throws(() => normalizeTwitch('nome com espaço'));
});
test('normaliza identificadores e URLs de canais YouTube', () => {
  assert.equal(normalizeYouTube('https://www.youtube.com/@Exemplo/live'), '@exemplo');
  assert.equal(normalizeYouTube('https://youtube.com/channel/' + channelId), channelId);
  assert.equal(normalizeYouTube('@café'), '@café');
  assert.throws(() => normalizeYouTube('https://www.youtube.com/watch?v=abcdefghijk'));
  assert.throws(() => normalizeYouTube('https://evil.test/@exemplo'));
  assert.equal(youtubeLiveURL(channelId), 'https://www.youtube.com/channel/' + channelId + '/live');
});
test('extrai JSON com chaves e aspas em strings sem executar scripts', () => {
  assert.equal(extractJSON(page(), 'ytInitialPlayerResponse').videoDetails.title, 'Título com } e "aspas"');
  assert.deepEqual(extractJSON('window["ytInitialData"] = {"ok":true};', 'ytInitialData'), { ok: true });
  assert.equal(extractJSON('var ytInitialData = alert(1);', 'ytInitialData'), null);
  assert.equal(extractJSON('var ytInitialData = {broken};', 'ytInitialData'), null);
});
test('detecta uma live confirmada e monta a URL correta', () => {
  const live = parseYouTubeLive(page(), '@exemplo');
  assert.equal(live.session, videoId);
  assert.equal(live.url, 'https://www.youtube.com/watch?v=' + videoId);
  assert.equal(parseYouTubeLive(page(), channelId).name, 'Canal exemplo');
});
test('não confunde lives agendadas ou vídeos gravados com uma live ativa', () => {
  for (const liveBroadcastDetails of [{ isLiveNow: false, startTimestamp: '2099-01-01' }, undefined]) {
    assert.equal(parseYouTubeLive(page({ microformat: { playerMicroformatRenderer: { liveBroadcastDetails } } }), '@exemplo'), null);
  }
  assert.equal(parseYouTubeLive('var ytInitialData = {"channel":{}};', '@exemplo'), null);
});
test('não considera erros e páginas de consentimento como offline', () => {
  assert.throws(() => parseYouTubeLive('<html>Consentimento</html>', '@exemplo'), /não forneceu/);
  assert.throws(() => parseYouTubeLive(page({ microformat: {}, playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Restrito' } }), '@exemplo'), /Restrito/);
});
test('rejeita uma live que pertence a outro canal', () => {
  assert.throws(() => parseYouTubeLive(page(), 'UC' + 'b'.repeat(22)), /outro canal/);
  assert.throws(() => parseYouTubeLive(page(), '@outro'), /identificador/);
});
test('resolve o dono pelo ID do canal mesmo quando a URL do player não contém @', () => {
  assert.equal(parseYouTubeLive(page(), '@outro-identificador', channelId).session, videoId);
  assert.throws(() => parseYouTubeLive(page(), '@exemplo', 'UC' + 'b'.repeat(22)), /outro canal/);
});
test('encontra uma live na aba selecionada do canal sem usar recomendações', () => {
  const video = { videoId, thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }] };
  const data = { metadata: { channelMetadataRenderer: { externalId: channelId } }, contents: { twoColumnBrowseResultsRenderer: { tabs: [
    { tabRenderer: { selected: false, content: { videoRenderer: video } } },
    { tabRenderer: { selected: true, content: { richGridRenderer: { contents: [{ videoRenderer: { ...video, upcomingEventData: {} } }] } } } }
  ] } }, recommendations: { videoRenderer: video } };
  assert.deepEqual(parseYouTubeChannelPage('var ytInitialData = ' + JSON.stringify(data)), { channelId, liveVideoId: null });
  delete data.contents.twoColumnBrowseResultsRenderer.tabs[1].tabRenderer.content.richGridRenderer.contents[0].videoRenderer.upcomingEventData;
  assert.deepEqual(parseYouTubeChannelPage('var ytInitialData = ' + JSON.stringify(data)), { channelId, liveVideoId: videoId });
});
test('notifica cada sessão uma vez, inclusive após um falso offline', () => {
  const live = { session: 'session-1' };
  const first = transition(undefined, live);
  assert.equal(first.notify, true);
  assert.equal(transition(first.state, live).notify, false);
  const offline = transition(first.state, null);
  assert.equal(offline.state.online, false);
  assert.equal(transition(offline.state, live).notify, false);
  assert.equal(transition(offline.state, { session: 'session-2' }).notify, true);
});
test('valida configurações, elimina duplicatas e preserva autenticação', () => {
  const previous = { ...DEFAULT_SETTINGS, twitchClientId: 'client1234', twitchToken: 'secret' };
  const next = validateSettings({ ...previous, twitch: ['Alanzoka', 'alanzoka'], twitchToken: 'injected' }, previous);
  assert.deepEqual(next.twitch, ['alanzoka']);
  assert.equal(next.twitchToken, 'secret');
  assert.equal(validateSettings({ ...next, twitchClientId: 'other1234' }, next).twitchToken, '');
  assert.throws(() => validateSettings({ ...previous, intervalMinutes: 0 }));
  assert.throws(() => validateSettings({ ...previous, youtube: Array(101).fill('@teste') }));
});
test('somente URLs HTTPS de streams reconhecidos podem abrir abas', () => {
  assert.equal(safeStreamURL('https://www.twitch.tv/alanzoka'), true);
  assert.equal(safeStreamURL('https://www.youtube.com/watch?v=abcdefghijk'), true);
  for (const url of ['javascript:alert(1)', 'https://evil.test/watch?v=abcdefghijk', 'http://www.twitch.tv/test', 'https://www.twitch.tv.evil.test/test']) assert.equal(safeStreamURL(url), false);
});
