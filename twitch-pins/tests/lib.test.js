import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChannel, channelFromURL, addPin, movePin, channelStatus, safeAvatar, MAX_PINS } from '../lib.js';

test('normaliza login e link do canal sem aceitar páginas internas', () => {
  assert.equal(normalizeChannel('@Alanzoka'), 'alanzoka');
  assert.equal(normalizeChannel('https://www.twitch.tv/Gaules/about'), 'gaules');
  for (const name of ['directory', 'settings', 'name with space', 'https://twitch.tv.evil.test/hello']) assert.throws(() => normalizeChannel(name));
});
test('reconhece páginas de canais e navegação SPA sem confundir outras rotas', () => {
  for (const path of ['/alanzoka', '/alanzoka/about', '/alanzoka/videos', '/alanzoka/schedule']) assert.equal(channelFromURL('https://www.twitch.tv' + path), 'alanzoka');
  for (const path of ['/', '/directory', '/directory/category/valorant', '/settings/profile', '/videos/123', '/alanzoka/clip/123']) assert.equal(channelFromURL('https://www.twitch.tv' + path), null);
  assert.equal(channelFromURL('https://evil.test/alanzoka'), null);
});
test('novos fixados vão para o topo e duplicatas não mudam sua posição', () => {
  const first = addPin([], 'alanzoka', 100);
  const second = addPin(first, 'gaules', 200);
  assert.deepEqual(second.map(pin => pin.login), ['gaules', 'alanzoka']);
  assert.equal(second[1].pinnedAt, 100);
  assert.strictEqual(addPin(second, 'ALANZOKA', 300), second);
});
test('aplica limite de fixados preservando a lista anterior', () => {
  const pins = Array.from({ length: MAX_PINS }, (_, i) => ({ login: 'channel' + i }));
  assert.throws(() => addPin(pins, 'another'), /50/);
  assert.equal(pins.length, MAX_PINS);
});
test('organiza fixados para cima ou para baixo sem alterar a entrada', () => {
  const pins = ['a', 'b', 'c'].map(login => ({ login }));
  assert.deepEqual(movePin(pins, 'b', 'up').map(pin => pin.login), ['b', 'a', 'c']);
  assert.deepEqual(movePin(pins, 'b', 'down').map(pin => pin.login), ['a', 'c', 'b']);
  assert.deepEqual(pins.map(pin => pin.login), ['a', 'b', 'c']);
  assert.strictEqual(movePin(pins, 'a', 'up'), pins);
  assert.strictEqual(movePin(pins, 'missing', 'up'), pins);
});
const user = stream => ({ login: 'example', displayName: 'Example', profileImageURL: '', broadcastSettings: { title: 'Minha live' }, stream });
test('mantém somente status atual ao alternar entre live e offline', () => {
  const live = channelStatus(user({ viewersCount: 30, game: { name: 'Jogo' } }), 1000);
  assert.equal(live.online, true);
  assert.equal(live.game, 'Jogo');
  assert.equal(live.viewers, 30);
  assert.equal('history' in live, false);
  assert.equal('session' in live, false);
  const offline = channelStatus(user(null), 2000);
  assert.equal(offline.online, false);
  assert.equal(offline.viewers, 0);
  assert.equal(offline.game, '');
  assert.equal(offline.checkedAt, 2000);
});
test('resposta sem estado de stream não vira falso offline', () => {
  assert.throws(() => channelStatus({ login: 'example' }, 1000), /estado válido/);
});
test('avatares usam somente HTTPS e domínios conhecidos da Twitch', () => {
  assert.equal(safeAvatar('https://static-cdn.jtvnw.net/profile.png'), 'https://static-cdn.jtvnw.net/profile.png');
  for (const url of ['javascript:alert(1)', 'https://evil.test/image.png', 'http://static-cdn.jtvnw.net/profile.png', 'https://twitchcdn.net.evil.test/profile.png']) assert.equal(safeAvatar(url), '');
});
