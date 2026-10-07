(() => {
  const host = document.createElement('div');
  host.id = 'live-radar-notifications';
  host.style.cssText = 'all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important;display:block!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host{color-scheme:dark} *{box-sizing:border-box} .stack{display:flex;flex-direction:column;gap:12px;width:min(380px,calc(100vw - 40px));max-height:85vh;overflow:auto;font:14px/1.5 system-ui,sans-serif;color:#faf7ff}
    .card{background:#171522;border:1px solid #4e3b70;border-radius:18px;padding:18px;box-shadow:0 10px 45px #0008;animation:enter .2s ease-out}.meta{font-size:11px;font-weight:700;color:#c7a2ff;letter-spacing:.1em;text-transform:uppercase}.dot{display:inline-block;width:7px;height:7px;background:#ff526c;border-radius:50%;margin-right:7px}h3{margin:7px 0 4px;font-size:19px;overflow-wrap:anywhere}p{color:#c5bfd5;margin:0 0 15px;overflow-wrap:anywhere}.actions{display:flex;gap:6px;flex-wrap:wrap}button{font:600 12px system-ui;border:1px solid #50445f;background:#2c2538;color:white;border-radius:9px;padding:9px 11px;cursor:pointer}button:hover{background:#463454}button.watch{background:#8d56f1;border-color:#8d56f1}button:focus-visible{outline:2px solid white;outline-offset:2px}.error{color:#ff9aa9;font-size:12px;margin:8px 0 0}@keyframes enter{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
  `;
  const stack = document.createElement('div');
  stack.className = 'stack';
  stack.setAttribute('aria-live', 'polite');
  shadow.append(style, stack);
  let refreshVersion = 0;
  async function refresh() {
    const version = ++refreshVersion;
    if (document.visibilityState !== 'visible') { host.remove(); return; }
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING' });
      if (version !== refreshVersion || document.visibilityState !== 'visible') return;
      if (!response?.ok) return;
      stack.replaceChildren();
      for (const item of response.data.pending.slice(-3).reverse()) {
        const card = document.createElement('section');
        card.className = 'card';
        const meta = document.createElement('div');
        meta.className = 'meta';
        const dot = document.createElement('span');
        dot.className = 'dot';
        meta.append(dot, document.createTextNode('Ao vivo · ' + (item.platform === 'twitch' ? 'Twitch' : 'YouTube')));
        const heading = document.createElement('h3');
        heading.textContent = item.name;
        const title = document.createElement('p');
        title.textContent = item.title;
        const actions = document.createElement('div');
        actions.className = 'actions';
        for (const [label, action, muted] of [['Ignorar', 'DISMISS', false], ['De fundo, mudo', 'OPEN', true], ['Assistir', 'OPEN', false]]) {
          const button = document.createElement('button');
          button.textContent = label;
          if (label === 'Assistir') button.className = 'watch';
          button.addEventListener('click', async () => {
            button.disabled = true;
            try {
              const result = await chrome.runtime.sendMessage({ type: action, id: item.id, muted });
              if (!result?.ok) throw new Error(result?.error || 'Não foi possível abrir a transmissão.');
              await refresh();
            } catch (error) {
              let text = card.querySelector('.error');
              if (!text) { text = document.createElement('div'); text.className = 'error'; card.append(text); }
              text.textContent = error.message;
            } finally { button.disabled = false; }
          });
          actions.append(button);
        }
        card.append(meta, heading, title, actions);
        stack.append(card);
      }
      if (stack.children.length) document.documentElement.append(host);
      else host.remove();
    } catch { host.remove(); }
  }
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'RADAR_UPDATED') refresh(); });
  document.addEventListener('visibilitychange', refresh);
  refresh();
})();
