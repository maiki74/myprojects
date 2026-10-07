(async () => {
  const { channelFromURL, safeAvatar } = await import(chrome.runtime.getURL('lib.js'));
  const PIN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8v2h-1v5l3 4v2H6v-2l3-4V5H8V3Z"/><path d="M12 16v5"/></svg>';
  const EYE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3.1 4.1M6.3 6.3A20 20 0 0 0 2 12s3.5 7 10 7c1.9 0 3.6-.6 5.1-1.5M10 10a3 3 0 0 0 4 4"/></svg>';
  let state = { pins: [], channelState: {}, sidebarCollapsed: false };
  let lastURL = location.href;
  let timer;
  let buttonBusy = false;
  let pinError = '';
  let renderKey = '';
  const buttonHost = document.createElement('span');
  buttonHost.id = 'twitch-pins-channel-button';
  buttonHost.style.cssText = 'display:inline-flex;align-items:center;align-self:center;vertical-align:middle;flex:0 0 auto;line-height:0;margin:0 0 0 4px;';
  const buttonShadow = buttonHost.attachShadow({ mode: 'open' });
  buttonShadow.innerHTML = `<style>:host{font:600 13px/1.4 system-ui,sans-serif}svg{display:block;flex-shrink:0}button{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;flex-shrink:0;line-height:0;width:34px;height:34px;border:0;background:transparent;color:#bf94ff;padding:0;border-radius:6px;cursor:pointer}button:hover{background:#a970ff22}button[aria-pressed=true]{background:#a970ff;color:#170c24}button:disabled{opacity:.65;cursor:wait}button:focus-visible{outline:2px solid #fff;outline-offset:2px}.error{font:12px system-ui;color:#ff819a;max-width:230px;margin-left:8px}.error:empty{display:none}:host(.floating){position:fixed!important;right:24px!important;bottom:28px!important;z-index:100000!important;background:#18181b;border-radius:8px;padding:8px;box-shadow:0 4px 20px #0005}</style><button type="button" aria-pressed="false" aria-label="Fixar canal">${PIN_SVG}</button><span class="error" role="status"></span>`;
  const pinButton = buttonShadow.querySelector('button');
  const sidebarHost = document.createElement('section');
  sidebarHost.id = 'twitch-pins-sidebar';
  sidebarHost.style.cssText = 'display:block;width:100%;box-sizing:border-box;';
  const sidebarShadow = sidebarHost.attachShadow({ mode: 'open' });
  sidebarShadow.innerHTML = `<style>
    :host{display:block;color:var(--color-text-base,#efeff1);font:13px/1.5 system-ui,sans-serif}*{box-sizing:border-box}.box{padding:8px 6px 2px;border-bottom:1px solid #8883;margin-bottom:0}.heading{display:flex;align-items:center;gap:7px;padding:0 5px 8px;color:#a970ff;font-weight:750;font-size:12px;letter-spacing:.05em}.heading .count{color:var(--color-text-alt-2,#92929a);font-size:11px;font-weight:500;letter-spacing:0;margin-right:auto}.tool{border:0;background:transparent;color:#a970ff;font:16px system-ui;cursor:pointer;border-radius:4px;padding:2px 4px}.tool:hover{background:#a970ff22}.list{display:grid;gap:3px}.row{display:flex;align-items:center;gap:4px;padding:4px 3px;border-radius:5px}.row:hover{background:#8882}.channel{display:flex;align-items:center;gap:8px;flex:1;min-width:0;color:inherit;text-decoration:none}.avatar{display:grid;place-items:center;width:30px;height:30px;flex-shrink:0;background:#a970ff33;color:#bd93ff;border-radius:50%;font-size:11px;font-weight:700;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.text{min-width:0;flex:1}.name-line{display:flex;align-items:center;gap:5px;min-width:0}.name{display:block;flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.live-meta{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;font-size:10px;color:var(--color-text-alt-2,#92929a)}.stream-title{display:block;color:var(--color-text-alt-2,#92929a);font-size:10px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detail{display:block;color:var(--color-text-alt-2,#92929a);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{width:7px;height:7px;border-radius:50%;background:#777;flex-shrink:0}.status.live{background:#eb4760}.status.unknown{background:#a970ff}.remove{border:0;background:transparent;color:var(--color-text-alt-2,#92929a);cursor:pointer;font-size:16px;line-height:1;padding:4px;opacity:0}.row:hover .remove,.remove:focus-visible{opacity:1}.empty{padding:4px 6px;font-size:11px;color:var(--color-text-alt-2,#92929a)}.contents[hidden]{display:none}.visibility{display:inline-flex;align-items:center;justify-content:center}.error{color:#e0909f;font-size:10px;padding:5px 6px}.error:empty{display:none}.compact .heading{justify-content:center;gap:3px;padding:0 0 7px}.compact .heading-label,.compact .count,.compact .tool,.compact .text,.compact .remove,.compact .empty,.compact .error{display:none}.compact .visibility{display:inline-flex}.compact .row{padding:4px 0}.compact .channel{justify-content:center;gap:0;position:relative}.compact .channel::after{content:"";position:absolute;right:0;bottom:0;border:1px solid var(--color-background-base,#18181b);width:7px;height:7px;background:#777;border-radius:50%}.compact .channel.live::after{background:#eb4760}.compact .channel.unknown::after{background:#a970ff}.compact .box{padding:8px 5px 2px}.tool:focus-visible,a:focus-visible,.remove:focus-visible{outline:2px solid #a970ff;outline-offset:2px}
  </style><div class="box"><div class="heading">${PIN_SVG}<span class="heading-label">FIXADOS</span><span class="count"></span><button class="tool visibility" type="button" aria-expanded="true" aria-controls="twitch-pins-list-content" aria-label="Ocultar canais fixados" title="Ocultar canais fixados">${EYE_SVG}</button><button class="tool refresh" type="button" title="Atualizar status" aria-label="Atualizar canais fixados">↻</button><button class="tool manage" type="button" title="Organizar fixados" aria-label="Organizar canais fixados">⚙</button></div><div class="contents" id="twitch-pins-list-content"><div class="list"></div><div class="empty">Nenhum canal fixado.</div><div class="error" role="status"></div></div></div>`;
  const resize = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect.width;
    sidebarShadow.querySelector('.box').classList.toggle('compact', width > 0 && width < 110);
  });
  let observedSidebar;
  async function send(type, args = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...args });
    if (!response?.ok) throw new Error(response?.error || 'A extensão não respondeu.');
    return response.data;
  }
  pinButton.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation();
    const login = channelFromURL(location.href);
    if (!login || buttonBusy) return;
    buttonBusy = true; pinError = ''; renderButton();
    try {
      state = await send(state.pins.some(pin => pin.login === login) ? 'UNPIN' : 'PIN', { login });
      renderSidebar();
    } catch (error) { pinError = error.message; }
    finally { buttonBusy = false; renderButton(); }
  });
  sidebarShadow.querySelector('.refresh').addEventListener('click', async () => {
    const button = sidebarShadow.querySelector('.refresh'); button.disabled = true;
    try { state = await send('REFRESH'); renderSidebar(); }
    catch (error) { sidebarShadow.querySelector('.error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  sidebarShadow.querySelector('.manage').addEventListener('click', () => send('OPEN_PANEL').catch(() => {}));
  sidebarShadow.querySelector('.visibility').addEventListener('click', async () => {
    const button = sidebarShadow.querySelector('.visibility');
    button.disabled = true;
    try { state = await send('SET_SIDEBAR_COLLAPSED', { collapsed: !state.sidebarCollapsed }); renderSidebar(); }
    catch (error) { button.title = error.message; }
    finally { button.disabled = false; }
  });
  function renderButton() {
    const login = channelFromURL(location.href);
    if (!login) { buttonHost.remove(); return; }
    const pinned = state.pins.some(pin => pin.login === login);
    pinButton.setAttribute('aria-label', (pinned ? 'Desafixar canal ' : 'Fixar canal ') + login);
    pinButton.setAttribute('aria-pressed', String(pinned));
    pinButton.title = pinned ? 'Remover ' + login + ' dos fixados' : 'Fixar ' + login + ' sem seguir';
    pinButton.disabled = buttonBusy;
    buttonShadow.querySelector('.error').textContent = pinError;
    const header = document.querySelector('[data-a-target="channel-header-right"], [data-test-selector="channel-header__actions"]');
    const selectors = '[data-a-target="follow-button"], [data-a-target="unfollow-button"], [data-a-target="subscribe-button"], [data-a-target="subscription-button"]';
    const action = header?.querySelector(selectors) || document.querySelector(selectors);
    const control = action?.closest('button, a') || action;
    let target = header || control?.parentElement;
    // Match the action row instead of appending to a taller, multi-row header.
    for (let node = control?.parentElement, depth = 0; node && depth < 6; node = node.parentElement, depth++) {
      const style = getComputedStyle(node);
      const horizontal = ['flex', 'inline-flex'].includes(style.display) && style.flexDirection === 'row';
      if ((horizontal || style.display === 'grid') && node.querySelectorAll('button, a[data-a-target]').length > 1) { target = node; break; }
      if (node === header || node === document.body) break;
    }
    const height = control?.getBoundingClientRect().height;
    const size = height >= 24 && height <= 40 ? height : 34;
    pinButton.style.width = pinButton.style.height = size + 'px';
    if (target && !target.closest('#twitch-pins-sidebar')) {
      buttonHost.classList.remove('floating');
      if (buttonHost.parentElement !== target) target.append(buttonHost);
    } else {
      buttonHost.classList.add('floating');
      if (buttonHost.parentElement !== document.body) document.body.append(buttonHost);
    }
  }
  function renderSidebar() {
    const sidebar = document.querySelector('.side-nav__scrollable_content .scrollable-area-content, .side-nav__scrollable_content, [data-a-target="side-nav"] .scrollable-area-content, [data-a-target="side-nav"], .side-nav');
    if (!sidebar) { sidebarHost.remove(); observedSidebar = undefined; resize.disconnect(); return; }
    if (sidebarHost.parentElement !== sidebar) sidebar.prepend(sidebarHost);
    if (observedSidebar !== sidebar) { resize.disconnect(); resize.observe(sidebar); observedSidebar = sidebar; }
    const key = JSON.stringify(state);
    if (key === renderKey) return;
    renderKey = key;
    const collapsed = Boolean(state.sidebarCollapsed);
    sidebarShadow.querySelector('.contents').hidden = collapsed;
    const visibility = sidebarShadow.querySelector('.visibility');
    visibility.innerHTML = collapsed ? EYE_OFF_SVG : EYE_SVG;
    visibility.setAttribute('aria-expanded', String(!collapsed));
    visibility.title = collapsed ? 'Mostrar canais fixados' : 'Ocultar canais fixados';
    visibility.setAttribute('aria-label', visibility.title);
    sidebarShadow.querySelector('.count').textContent = String(state.pins.length);
    sidebarShadow.querySelector('.empty').hidden = Boolean(state.pins.length);
    sidebarShadow.querySelector('.error').textContent = state.error ? 'Não foi possível atualizar. Último estado conhecido; tente ↻.' : '';
    const list = sidebarShadow.querySelector('.list'); list.replaceChildren();
    for (const pin of state.pins) {
      const status = state.channelState[pin.login] || {};
      const name = status.displayName || pin.displayName || pin.login;
      const current = status.error ? 'Status indisponível' : status.online === true ? 'Ao vivo' : status.online === false ? 'Offline' : 'Verificando';
      const row = document.createElement('div'); row.className = 'row';
      const live = status.online === true;
      const unknown = Boolean(status.error) || status.online === undefined;
      const viewers = new Intl.NumberFormat('pt-BR').format(status.viewers || 0);
      const channel = document.createElement('a'); channel.className = 'channel' + (unknown ? ' unknown' : live ? ' live' : ''); channel.href = 'https://www.twitch.tv/' + pin.login;
      const summary = live ? [status.game || 'Categoria não informada', viewers + ' espectadores', status.title || 'Título não informado'].join('\n') : '';
      channel.title = `${name} · ${current}${summary ? '\n' + summary : ''}${status.error ? '\n' + status.error : ''}`;
      channel.setAttribute('aria-label', name + ' — ' + current);
      if (summary) channel.setAttribute('aria-description', summary);
      const avatar = document.createElement('span'); avatar.className = 'avatar';
      const imageURL = safeAvatar(status.avatar);
      if (imageURL) { const image = document.createElement('img'); image.src = imageURL; image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => { avatar.textContent = name.slice(0, 2).toUpperCase(); }, { once: true }); avatar.append(image); }
      else avatar.textContent = name.slice(0, 2).toUpperCase();
      const text = document.createElement('span'); text.className = 'text';
      const nameLine = document.createElement('span'); nameLine.className = 'name-line';
      const username = document.createElement('span'); username.className = 'name'; username.textContent = name;
      const liveMeta = document.createElement('span'); liveMeta.className = 'live-meta';
      const dot = document.createElement('span'); dot.className = 'status' + (unknown ? ' unknown' : live ? ' live' : '');
      liveMeta.append(dot);
      if (live) {
        const audience = document.createElement('span'); audience.className = 'viewers'; audience.textContent = viewers; audience.title = viewers + ' espectadores';
        liveMeta.append(audience);
      }
      nameLine.append(username, liveMeta);
      const detail = document.createElement('span'); detail.className = 'detail'; detail.textContent = live ? status.game || 'Categoria não informada' : current;
      text.append(nameLine, detail);
      if (live) {
        const title = document.createElement('span'); title.className = 'stream-title'; title.textContent = status.title || 'Título não informado'; title.title = title.textContent;
        text.append(title);
      }
      channel.append(avatar, text);
      const remove = document.createElement('button'); remove.className = 'remove'; remove.type = 'button'; remove.textContent = '×'; remove.title = 'Desafixar ' + name; remove.setAttribute('aria-label', 'Desafixar ' + name);
      remove.addEventListener('click', async () => { try { state = await send('UNPIN', { login: pin.login }); renderSidebar(); renderButton(); } catch (error) { sidebarShadow.querySelector('.error').textContent = error.message; } });
      row.append(channel, remove); list.append(row);
    }
  }
  function mount() { renderButton(); renderSidebar(); }
  function debounceMount() { clearTimeout(timer); timer = setTimeout(mount, 100); }
  try { state = await send('GET_STATE'); } catch (error) { state.error = error.message; }
  mount();
  new MutationObserver(debounceMount).observe(document.body, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of ['pins', 'channelState', 'lastAttempt', 'lastSuccess', 'error', 'sidebarCollapsed']) if (changes[key]) state[key] = changes[key].newValue ?? (key === 'pins' ? [] : key === 'channelState' ? {} : key === 'sidebarCollapsed' ? false : '');
    mount();
  });
  addEventListener('popstate', () => { pinError = ''; mount(); });
  setInterval(() => { if (lastURL !== location.href) { lastURL = location.href; pinError = ''; mount(); } }, 1000);
})().catch(error => console.warn('Twitch Pins:', error.message));
