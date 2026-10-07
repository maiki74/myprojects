import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeTwitch, normalizeYouTube, youtubeLiveURL, extractJSON, parseYouTubeLive, parseYouTubeChannelPage, transition, safeStreamURL, validateSettings } from '../lib.js';

const channelId = 'UC' + 'a'.repeat(22);
const videoId = 'abcdefghijk';
function page(overrides = {}) {
  return 'var ytInitialPlayerResponse = ' + JSON.stringify({
    videoDetails: { videoId, channelId, author: 'Example channel', title: 'Title with } and "quotes"' },
    microformat: { playerMicroformatRenderer: { ownerProfileUrl: 'https://www.youtube.com/@example', liveBroadcastDetails: { isLiveNow: true } } },
    ...overrides
  }) + ';';
}
test('normalizes Twitch logins and URLs and rejects lookalike domains', () => {
  assert.equal(normalizeTwitch('https://www.twitch.tv/Alanzoka?x=1'), 'alanzoka');
  assert.equal(normalizeTwitch('@Gaules'), 'gaules');
  assert.throws(() => normalizeTwitch('https://twitch.tv.evil.test/test'));
  assert.throws(() => normalizeTwitch('name with spaces'));
});
test('normalizes YouTube channel handles and URLs', () => {
  assert.equal(normalizeYouTube('https://www.youtube.com/@Example/live'), '@example');
  assert.equal(normalizeYouTube('https://youtube.com/channel/' + channelId), channelId);
  assert.equal(normalizeYouTube('@café'), '@café');
  assert.throws(() => normalizeYouTube('https://www.youtube.com/watch?v=abcdefghijk'));
  assert.throws(() => normalizeYouTube('https://evil.test/@example'));
  assert.equal(youtubeLiveURL(channelId), 'https://www.youtube.com/channel/' + channelId + '/live');
});
test('extracts JSON containing braces and quotes without executing scripts', () => {
  assert.equal(extractJSON(page(), 'ytInitialPlayerResponse').videoDetails.title, 'Title with } and "quotes"');
  assert.deepEqual(extractJSON('window["ytInitialData"] = {"ok":true};', 'ytInitialData'), { ok: true });
  assert.equal(extractJSON('var ytInitialData = alert(1);', 'ytInitialData'), null);
  assert.equal(extractJSON('var ytInitialData = {broken};', 'ytInitialData'), null);
});
test('detects a confirmed live stream and builds its URL', () => {
  const live = parseYouTubeLive(page(), '@example');
  assert.equal(live.session, videoId);
  assert.equal(live.url, 'https://www.youtube.com/watch?v=' + videoId);
  assert.equal(parseYouTubeLive(page(), channelId).name, 'Example channel');
});
test('does not confuse scheduled streams or recordings with an active stream', () => {
  for (const liveBroadcastDetails of [{ isLiveNow: false, startTimestamp: '2099-01-01' }, undefined]) {
    assert.equal(parseYouTubeLive(page({ microformat: { playerMicroformatRenderer: { liveBroadcastDetails } } }), '@example'), null);
  }
  assert.equal(parseYouTubeLive('var ytInitialData = {"channel":{}};', '@example'), null);
});
test('does not treat errors and consent pages as offline', () => {
  assert.throws(() => parseYouTubeLive('<html>Consent</html>', '@example'), /did not provide/);
  assert.throws(() => parseYouTubeLive(page({ microformat: {}, playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Restricted' } }), '@example'), /Restricted/);
});
test('rejects a stream owned by another channel', () => {
  assert.throws(() => parseYouTubeLive(page(), 'UC' + 'b'.repeat(22)), /different channel/);
  assert.throws(() => parseYouTubeLive(page(), '@another'), /stream owner/);
});
test('resolves ownership by channel ID when the player URL has no handle', () => {
  assert.equal(parseYouTubeLive(page(), '@another-handle', channelId).session, videoId);
  assert.throws(() => parseYouTubeLive(page(), '@example', 'UC' + 'b'.repeat(22)), /different channel/);
});
test('finds a stream in the selected channel tab without using recommendations', () => {
  const video = { videoId, thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }] };
  const data = { metadata: { channelMetadataRenderer: { externalId: channelId } }, contents: { twoColumnBrowseResultsRenderer: { tabs: [
    { tabRenderer: { selected: false, content: { videoRenderer: video } } },
    { tabRenderer: { selected: true, content: { richGridRenderer: { contents: [{ videoRenderer: { ...video, upcomingEventData: {} } }] } } } }
  ] } }, recommendations: { videoRenderer: video } };
  assert.deepEqual(parseYouTubeChannelPage('var ytInitialData = ' + JSON.stringify(data)), { channelId, liveVideoId: null });
  delete data.contents.twoColumnBrowseResultsRenderer.tabs[1].tabRenderer.content.richGridRenderer.contents[0].videoRenderer.upcomingEventData;
  assert.deepEqual(parseYouTubeChannelPage('var ytInitialData = ' + JSON.stringify(data)), { channelId, liveVideoId: videoId });
});
test('notifies once per session even after a false offline result', () => {
  const live = { session: 'session-1' };
  const first = transition(undefined, live);
  assert.equal(first.notify, true);
  assert.equal(transition(first.state, live).notify, false);
  const offline = transition(first.state, null);
  assert.equal(offline.state.online, false);
  assert.equal(transition(offline.state, live).notify, false);
  assert.equal(transition(offline.state, { session: 'session-2' }).notify, true);
});
test('validates settings, removes duplicates, and preserves authentication', () => {
  const previous = { ...DEFAULT_SETTINGS, twitchClientId: 'client1234', twitchToken: 'secret' };
  const next = validateSettings({ ...previous, twitch: ['Alanzoka', 'alanzoka'], twitchToken: 'injected' }, previous);
  assert.deepEqual(next.twitch, ['alanzoka']);
  assert.equal(next.twitchToken, 'secret');
  assert.equal(validateSettings({ ...next, twitchClientId: 'other1234' }, next).twitchToken, '');
  assert.throws(() => validateSettings({ ...previous, intervalMinutes: 0 }));
  assert.throws(() => validateSettings({ ...previous, youtube: Array(101).fill('@test') }));
});
test('only recognized HTTPS stream URLs can open tabs', () => {
  assert.equal(safeStreamURL('https://www.twitch.tv/alanzoka'), true);
  assert.equal(safeStreamURL('https://www.youtube.com/watch?v=abcdefghijk'), true);
  for (const url of ['javascript:alert(1)', 'https://evil.test/watch?v=abcdefghijk', 'http://www.twitch.tv/test', 'https://www.twitch.tv.evil.test/test']) assert.equal(safeStreamURL(url), false);
});
