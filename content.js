(() => {
  const BUTTON_ID = "twitch-channel-notes-button";
  const MODAL_ID = "twitch-channel-notes-modal";
  const STORAGE_PREFIX = "twitch_channel_notes:";
  const FONT_SIZE_PREFIX = "twitch_channel_notes_font_size:";
  const FONT_FAMILY_PREFIX = "twitch_channel_notes_font_family:";
  const DEFAULT_FONT_SIZE = 15;
  const MIN_FONT_SIZE = 12;
  const MAX_FONT_SIZE = 30;
  const FONT_STEP = 1;
  const AVAILABLE_FONTS = [
    "Inter, sans-serif",
    "Arial, sans-serif",
    "Helvetica, Arial, sans-serif",
    "Verdana, sans-serif",
    "Tahoma, sans-serif",
    "Trebuchet MS, sans-serif",
    "Segoe UI, sans-serif",
    "Roboto, sans-serif",
    "Open Sans, sans-serif",
    "Lato, sans-serif",
    "Poppins, sans-serif",
    "Montserrat, sans-serif",
    "Nunito, sans-serif",
    "Ubuntu, sans-serif",
    "Fira Sans, sans-serif",
    "Source Sans Pro, sans-serif",
    "Merriweather, serif",
    "Georgia, serif",
    "Times New Roman, serif",
    "Playfair Display, serif",
    "PT Serif, serif",
    "Bitter, serif",
    "Courier New, monospace",
    "Consolas, monospace",
    "Fira Code, monospace",
    "JetBrains Mono, monospace",
    "Source Code Pro, monospace",
    "Inconsolata, monospace",
    "Comic Sans MS, cursive",
    "Lucida Console, monospace"
  ];

  function getChannelFromPath() {
    const path = window.location.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => part.trim())
      .filter(Boolean);

    if (path.length === 0) {
      return null;
    }

    const reserved = new Set([
      "directory",
      "downloads",
      "jobs",
      "login",
      "logout",
      "messages",
      "popout",
      "search",
      "settings",
      "signup",
      "subscriptions",
      "turbo",
      "videos",
      "wallet"
    ]);

    const candidate = path[0].toLowerCase();
    if (reserved.has(candidate)) {
      return null;
    }

    return candidate;
  }

  function getStorageKey() {
    const channel = getChannelFromPath();
    return channel ? `${STORAGE_PREFIX}${channel}` : null;
  }

  function getFontSizeKey() {
    const channel = getChannelFromPath();
    return channel ? `${FONT_SIZE_PREFIX}${channel}` : null;
  }

  function getFontFamilyKey() {
    const channel = getChannelFromPath();
    return channel ? `${FONT_FAMILY_PREFIX}${channel}` : null;
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] ?? "");
      });
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }

  async function openModal() {
    if (document.getElementById(MODAL_ID)) {
      return;
    }

    const key = getStorageKey();
    if (!key) {
      return;
    }

    const fontSizeKey = getFontSizeKey();
    const fontFamilyKey = getFontFamilyKey();
    const currentValue = await storageGet(key);
    const savedFontRaw = fontSizeKey ? await storageGet(fontSizeKey) : "";
    const savedFontFamilyRaw = fontFamilyKey ? await storageGet(fontFamilyKey) : "";

    let fontSize = Number.parseInt(savedFontRaw, 10);
    if (!Number.isFinite(fontSize)) {
      fontSize = DEFAULT_FONT_SIZE;
    }
    fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize));
    let fontFamily = AVAILABLE_FONTS.includes(savedFontFamilyRaw)
      ? savedFontFamilyRaw
      : AVAILABLE_FONTS[0];

    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;

    const dialog = document.createElement("div");
    dialog.className = "notes-dialog";

    const channel = getChannelFromPath();

    const header = document.createElement("div");
    header.className = "notes-header";
    header.innerHTML = `<span>Notes do canal: ${channel}</span>`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "notes-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Fechar notes");
    closeBtn.textContent = "×";
    header.appendChild(closeBtn);

    const textarea = document.createElement("textarea");
    textarea.placeholder = "Escreva suas notes aqui... (sem limite de caracteres)";
    textarea.value = currentValue;

    const footer = document.createElement("div");
    footer.className = "notes-footer";

    const autosaveLabel = document.createElement("span");
    autosaveLabel.textContent = "Autosave ativo • Rodinha aumenta a fonte (Alt+rodinha diminui).";

    const rightControls = document.createElement("div");
    rightControls.className = "notes-right-controls";

    const fontFamilySelect = document.createElement("select");
    fontFamilySelect.className = "notes-font-family";
    fontFamilySelect.setAttribute("aria-label", "Selecionar fonte");

    for (const font of AVAILABLE_FONTS) {
      const option = document.createElement("option");
      option.value = font;
      option.textContent = font.split(",")[0];
      fontFamilySelect.appendChild(option);
    }

    fontFamilySelect.value = fontFamily;

    const fontSizeLabel = document.createElement("span");
    fontSizeLabel.className = "notes-font-size";

    const updateFontSizeLabel = () => {
      fontSizeLabel.textContent = `Fonte: ${fontSize}px`;
    };

    updateFontSizeLabel();

    rightControls.appendChild(fontFamilySelect);
    rightControls.appendChild(fontSizeLabel);

    footer.appendChild(autosaveLabel);
    footer.appendChild(rightControls);

    textarea.style.fontSize = `${fontSize}px`;
    textarea.style.fontFamily = fontFamily;

    dialog.appendChild(header);
    dialog.appendChild(textarea);
    dialog.appendChild(footer);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let lastSaved = textarea.value;

    const save = async () => {
      if (textarea.value === lastSaved) {
        return;
      }
      lastSaved = textarea.value;
      await storageSet(key, textarea.value);
    };

    let fontSizeSaveTimer = null;

    const saveFontSize = async () => {
      if (!fontSizeKey) {
        return;
      }
      await storageSet(fontSizeKey, String(fontSize));
    };

    const saveFontFamily = async () => {
      if (!fontFamilyKey) {
        return;
      }
      await storageSet(fontFamilyKey, fontFamily);
    };

    const scheduleFontSizeSave = () => {
      if (fontSizeSaveTimer) {
        window.clearTimeout(fontSizeSaveTimer);
      }
      fontSizeSaveTimer = window.setTimeout(() => {
        saveFontSize();
        fontSizeSaveTimer = null;
      }, 550);
    };

    const closeModal = async () => {
      if (fontSizeSaveTimer) {
        window.clearTimeout(fontSizeSaveTimer);
        fontSizeSaveTimer = null;
      }
      await saveFontSize();
      await saveFontFamily();
      await save();
      backdrop.remove();
    };

    textarea.addEventListener("input", save);

    textarea.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();

        // Pedido do usuário: ao girar a rodinha sobre as notes, a fonte aumenta.
        // Diminuição opcional: segure Alt + rodinha para reduzir.
        if (event.altKey) {
          fontSize = Math.max(MIN_FONT_SIZE, fontSize - FONT_STEP);
        } else {
          fontSize = Math.min(MAX_FONT_SIZE, fontSize + FONT_STEP);
        }

        textarea.style.fontSize = `${fontSize}px`;
        updateFontSizeLabel();
        scheduleFontSizeSave();
      },
      { passive: false }
    );

    fontFamilySelect.addEventListener("change", async () => {
      fontFamily = fontFamilySelect.value;
      textarea.style.fontFamily = fontFamily;
      await saveFontFamily();
    });

    backdrop.addEventListener("click", async (event) => {
      if (event.target === backdrop) {
        await closeModal();
      }
    });

    closeBtn.addEventListener("click", closeModal);

    window.addEventListener(
      "beforeunload",
      () => {
        const payload = { [key]: textarea.value };
        if (fontSizeKey) {
          payload[fontSizeKey] = String(fontSize);
        }
        if (fontFamilyKey) {
          payload[fontFamilyKey] = fontFamily;
        }
        chrome.storage.local.set(payload);
      },
      { once: true }
    );

    textarea.focus();
  }

  function findSettingsButton() {
    const selectors = [
      "button[data-a-target='chat-settings']",
      "button[aria-label='Configurações do chat']",
      "button[aria-label='Chat Settings']",
      "[data-a-target='chat-settings'] button",
      "button[aria-haspopup='menu'][data-test-selector*='chat']"
    ];

    for (const selector of selectors) {
      const found = document.querySelector(selector);
      if (found) {
        return found;
      }
    }

    const allButtons = Array.from(document.querySelectorAll("button"));
    return allButtons.find((btn) => {
      const label = (btn.getAttribute("aria-label") || "").toLowerCase();
      const testId = (btn.getAttribute("data-a-target") || "").toLowerCase();
      return label.includes("chat settings") || label.includes("configurações do chat") || testId.includes("chat-settings");
    }) || null;
  }

  function createButton() {
    const settingsButton = findSettingsButton();

    if (!settingsButton) {
      return;
    }

    const settingsParent = settingsButton.closest("div");
    const toolbar = settingsParent?.parentElement;

    if (!settingsParent || !toolbar) {
      return;
    }

    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      if (!toolbar.contains(existing)) {
        existing.remove();
      } else {
        return;
      }
    }

    const wrapper = document.createElement("div");
    wrapper.id = BUTTON_ID;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "notes-trigger";
    button.textContent = "📝 Notes";
    button.setAttribute("aria-label", "Abrir notes do canal");
    button.addEventListener("click", openModal);

    wrapper.appendChild(button);
    toolbar.insertBefore(wrapper, settingsParent.nextSibling);
  }

  function boot() {
    createButton();

    const observer = new MutationObserver(() => {
      createButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
