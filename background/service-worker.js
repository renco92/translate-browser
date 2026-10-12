/**
 * Quizzler Web Immersion & Flashcard Studio - Manifest V3 Service Worker
 * Handles Side Panel opening, Context Menus, Keyboard Shortcuts, Badge Updates,
 * and CORS-free Live Translation & Dictionary Lookups.
 */

const STORAGE_KEY = "quizzler_ext_state_v1";

// Configure Side Panel to open automatically when clicking the extension toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn("sidePanel.setPanelBehavior error:", err));

// Set up Context Menus and initial badge on install/update
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "quizzler-inspect-selection",
      title: 'Inspect "%s" in Quizzler Dictionary & Flashcards',
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      id: "quizzler-translate-page",
      title: "Quizzler: Translate & Tokenize Page into Target Language",
      contexts: ["page"]
    });

    chrome.contextMenus.create({
      id: "quizzler-tokenize-native",
      title: "Quizzler: Tokenize Native Target-Language Page",
      contexts: ["page"]
    });

    chrome.contextMenus.create({
      id: "quizzler-open-studio",
      title: "Quizzler: Open Full-Screen 3D Flashcard Studio",
      contexts: ["page", "action"]
    });
  });

  await updateExtensionBadge();
});

// Keep badge synced whenever storage changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    await updateExtensionBadge();
  }
});

async function updateExtensionBadge() {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    const state = res?.[STORAGE_KEY];
    const lang = state?.targetLang || "fr";
    const vault = state?.vaults?.[lang] || {};
    const count = Object.keys(vault).length;

    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#eab308" });
  } catch (e) {
    // Ignore badge errors during startup
  }
}

// Context Menu Click Handler (Always confirms action to user via on-page toast)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "quizzler-inspect-selection" && info.selectionText) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "INSPECT_TEXT_SELECTION",
        text: info.selectionText.trim()
      });
    } catch (e) {
      // Content script might not be loaded on restricted pages
    }
  } else if (info.menuItemId === "quizzler-translate-page") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TRIGGER_TRANSLATE_PAGE"
      });
    } catch (e) {}
  } else if (info.menuItemId === "quizzler-tokenize-native") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TRIGGER_TOKENIZE_NATIVE_PAGE"
      });
    } catch (e) {}
  } else if (info.menuItemId === "quizzler-open-studio") {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("studio/studio.html")
    });
  }
});

// Keyboard Shortcut Commands
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "translate-page") {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_TRANSLATE_PAGE" });
    } catch (e) {}
  } else if (command === "tokenize-native-page") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TRIGGER_TOKENIZE_NATIVE_PAGE"
      });
    } catch (e) {}
  }
});

// Message Listener for Live Translation, Dictionary Fallback, and Studio/SidePanel Actions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "TRANSLATE_BATCH") {
        const results = await translateTextBatch(
          message.texts || [],
          message.sourceLang || "auto",
          message.targetLang || "fr"
        );
        sendResponse({ ok: true, results });
      } else if (message.type === "TRANSLATE_SINGLE") {
        const result = await translateSingleText(
          message.text || "",
          message.sourceLang || "auto",
          message.targetLang || "en"
        );
        sendResponse({ ok: true, ...result });
      } else if (message.type === "LOOKUP_LIVE_WORD") {
        const result = await lookupLiveWordDictionary(
          message.word || "",
          message.lang || "fr"
        );
        sendResponse({ ok: true, ...result });
      } else if (message.type === "OPEN_SIDE_PANEL") {
        const windowId =
          sender?.tab?.windowId ||
          (await chrome.windows.getLastFocused())?.id;
        if (windowId) {
          await chrome.sidePanel.open({ windowId });
        }
        sendResponse({ ok: true });
      } else if (message.type === "OPEN_STUDIO_TAB") {
        await chrome.tabs.create({
          url: chrome.runtime.getURL("studio/studio.html")
        });
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true; // Keep message channel open for async response
});

/**
 * Translates a single text and extracts phonetic/romaji info if available.
 */
async function translateSingleText(text, sourceLang = "auto", targetLang = "fr") {
  if (!text || !text.trim()) {
    return { translatedText: "", transliteration: "" };
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
    sourceLang
  )}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=rm&q=${encodeURIComponent(
    text
  )}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Translation HTTP ${response.status}`);
  }
  const data = await response.json();

  let translatedText = "";
  let transliteration = "";

  if (Array.isArray(data?.[0])) {
    for (const seg of data[0]) {
      if (seg?.[0]) translatedText += seg[0];
      if (seg?.[2]) transliteration += seg[2] + " ";
      else if (seg?.[3]) transliteration += seg[3] + " ";
    }
  }

  return {
    translatedText: translatedText.trim() || text,
    transliteration: transliteration.trim()
  };
}

/**
 * Translates an array of paragraph strings in a single separator-joined request
 * for fast webpage translation without rate-limiting.
 */
async function translateTextBatch(texts, sourceLang = "auto", targetLang = "fr") {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  // Join paragraphs with a unique newline separator that preserves sentence boundaries
  const SEP = "\n ||| \n";
  const combined = texts.join(SEP);

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
    sourceLang
  )}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=rm&q=${encodeURIComponent(
    combined
  )}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Batch HTTP ${response.status}`);
    const data = await response.json();

    let fullTranslated = "";
    if (Array.isArray(data?.[0])) {
      for (const seg of data[0]) {
        if (seg?.[0]) fullTranslated += seg[0];
      }
    }

    const parts = fullTranslated.split(/\s*\|\|\|\s*/);
    if (parts.length === texts.length) {
      return parts.map((t, i) => ({
        original: texts[i],
        translated: t.trim() || texts[i]
      }));
    }
  } catch (e) {
    // Fallback to individual translations if batch split mismatched
  }

  const results = [];
  for (const t of texts) {
    try {
      const single = await translateSingleText(t, sourceLang, targetLang);
      results.push({
        original: t,
        translated: single.translatedText,
        romaji: single.transliteration
      });
    } catch (e) {
      results.push({ original: t, translated: t, romaji: "" });
    }
  }
  return results;
}

/**
 * Live Dictionary & Translation Lookup for unknown words on any webpage.
 * Queries Google Translate's dictionary (`dt=bd&dt=t&dt=rm`) to get English definitions,
 * part of speech, and phonetic reading.
 */
async function lookupLiveWordDictionary(word, lang = "fr") {
  if (!word || !word.trim()) {
    return { en: "", pos: "word" };
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
    lang
  )}&tl=en&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(word.trim())}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Dictionary lookup HTTP ${response.status}`);
  }
  const data = await response.json();

  let primaryTranslation = "";
  let transliteration = "";
  if (Array.isArray(data?.[0])) {
    for (const seg of data[0]) {
      if (seg?.[0]) primaryTranslation += seg[0];
      if (seg?.[3]) transliteration += seg[3];
    }
  }

  let pos = "";
  let dictMeanings = [];
  if (Array.isArray(data?.[1]) && data[1].length > 0) {
    const firstPosBlock = data[1][0];
    if (firstPosBlock?.[0]) {
      pos = firstPosBlock[0]; // e.g., "noun", "verb", "adjective"
    }
    if (Array.isArray(firstPosBlock?.[1])) {
      dictMeanings = firstPosBlock[1].slice(0, 3);
    }
  }

  const finalEn =
    dictMeanings.length > 0
      ? dictMeanings.join(" / ")
      : primaryTranslation.trim() || word;

  return {
    en: finalEn,
    pos: pos || "word",
    romaji: transliteration.trim(),
    kana: "",
    ipa: transliteration ? `/${transliteration.trim()}/` : `/${word.trim().toLowerCase()}/`
  };
}
