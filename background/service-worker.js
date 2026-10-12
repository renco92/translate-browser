/**
 * Quizzler Web Immersion & Flashcard Studio - Manifest V3 Service Worker
 * Handles Side Panel opening, Context Menus, Keyboard Shortcuts, Badge Updates,
 * and Multi-Tier Live Translation & Dictionary Lookups (Google GTX + Wiktionary + Contextual).
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
      id: "quizzler-immerse-page",
      title: "Quizzler: Immerse Page (Auto-Detect Translate or Tokenize)",
      contexts: ["page"]
    });

    chrome.contextMenus.create({
      id: "quizzler-toggle-overlay",
      title: "Quizzler: Toggle Floating Overlay Bar on This Site",
      contexts: ["page"]
    });

    chrome.contextMenus.create({
      id: "quizzler-bookmark-page",
      title: "Quizzler: Bookmark This Page for Language Learning",
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

// Context Menu Click Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "quizzler-inspect-selection" && info.selectionText) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "INSPECT_TEXT_SELECTION",
        text: info.selectionText.trim()
      });
    } catch (e) {}
  } else if (info.menuItemId === "quizzler-immerse-page") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TRIGGER_SMART_IMMERSE_PAGE"
      });
    } catch (e) {}
  } else if (info.menuItemId === "quizzler-toggle-overlay") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TOGGLE_FLOATING_BAR"
      });
    } catch (e) {}
  } else if (info.menuItemId === "quizzler-bookmark-page") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "BOOKMARK_CURRENT_PAGE"
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

  if (command === "translate-page" || command === "tokenize-native-page") {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_SMART_IMMERSE_PAGE" });
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
          message.lang || "fr",
          message.contextSentence || ""
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
 * Translates an array of strings in a single separator-joined request.
 */
async function translateTextBatch(texts, sourceLang = "auto", targetLang = "fr") {
  if (!Array.isArray(texts) || texts.length === 0) return [];

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
 * Strips French elisions (l', d', qu', s', n', j', c', m', t', jusqu', lorsqu')
 * and trailing clitics so inflected/elided tokens resolve cleanly.
 */
function extractCleanLookupCandidates(rawWord, lang) {
  const trimmed = String(rawWord || "")
    .trim()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/^[.,\/#!$%\^&\*;:{}=\_~`()?"«»「」『』]+|[.,\/#!$%\^&\*;:{}=\_~`()?"«»「」『』]+$/g, "");

  const candidates = [trimmed];
  if (trimmed.toLowerCase() !== trimmed) {
    candidates.push(trimmed.toLowerCase());
  }

  if (lang === "fr") {
    const noElision = trimmed
      .replace(/^(jusqu'|lorsqu'|puisqu'|l'|d'|qu'|s'|c'|m'|t'|n'|j')/i, "")
      .replace(/-(t-il|t-elle|t-on|moi|toi|lui|le|la|les|nous|vous|en|y|il|elle|on|ils|elles|je|tu|ce|la|ci)$/i, "");
    if (noElision && !candidates.includes(noElision)) {
      candidates.push(noElision);
      if (noElision.toLowerCase() !== noElision) {
        candidates.push(noElision.toLowerCase());
      }
    }
  }

  return candidates.filter(Boolean);
}

/**
 * Queries Google Translate GTX dictionary endpoint (`dt=t&dt=bd&dt=at&dt=md&dt=rm`)
 */
async function queryGoogleGtxWord(queryWord, lang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
    lang
  )}&tl=en&dt=t&dt=bd&dt=at&dt=md&dt=rm&q=${encodeURIComponent(queryWord)}`;

  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();

  let primaryTranslation = "";
  let transliteration = "";
  if (Array.isArray(data?.[0])) {
    for (const seg of data[0]) {
      if (seg?.[0]) primaryTranslation += seg[0];
      if (seg?.[3]) transliteration += seg[3];
      else if (seg?.[2]) transliteration += seg[2];
    }
  }
  primaryTranslation = primaryTranslation.trim();

  let pos = "";
  let dictMeanings = [];
  // data[1] is bilingual dictionary: [[pos, [gloss1, gloss2, ...], ...], ...]
  if (Array.isArray(data?.[1]) && data[1].length > 0) {
    const posBlocks = data[1];
    pos = posBlocks[0]?.[0] || "";
    for (const block of posBlocks.slice(0, 2)) {
      if (Array.isArray(block?.[1])) {
        for (const g of block[1].slice(0, 3)) {
          if (g && !dictMeanings.includes(g)) dictMeanings.push(g);
        }
      }
    }
  }

  // data[5] is alternative translations (`dt=at`) when `dt=bd` is empty
  let altMeanings = [];
  if (dictMeanings.length === 0 && Array.isArray(data?.[5]?.[0]?.[2])) {
    for (const alt of data[5][0][2].slice(0, 3)) {
      const candidate = alt?.[0]?.trim();
      if (
        candidate &&
        candidate.toLowerCase() !== queryWord.toLowerCase() &&
        !altMeanings.includes(candidate)
      ) {
        altMeanings.push(candidate);
      }
    }
  }

  const bestGlossList = dictMeanings.length > 0 ? dictMeanings : altMeanings;
  const finalEn =
    bestGlossList.length > 0
      ? bestGlossList.slice(0, 4).join(" / ")
      : primaryTranslation;

  const isSameAsInput =
    !finalEn || finalEn.toLowerCase() === queryWord.toLowerCase();

  return {
    en: finalEn,
    pos: pos || "word",
    romaji: transliteration.trim(),
    isSameAsInput,
    hasDictEntry: dictMeanings.length > 0
  };
}

/**
 * Queries English Wiktionary REST API for literary/inflected words and IPA.
 */
async function queryWiktionaryDefinition(queryWord, lang) {
  try {
    const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(
      queryWord
    )}`;
    const resp = await fetch(url, {
      headers: { Accept: "application/json" }
    });
    if (!resp.ok) return null;
    const data = await resp.json();

    const langNames = {
      fr: "French",
      ja: "Japanese",
      es: "Spanish",
      de: "German",
      it: "Italian"
    };
    const targetLangName = langNames[lang] || "";

    // Find matching language section or fallback to any non-English section
    let entries = data[lang];
    if (!entries) {
      for (const [, list] of Object.entries(data)) {
        if (
          Array.isArray(list) &&
          list.some((item) => item.language === targetLangName)
        ) {
          entries = list.filter((item) => item.language === targetLangName);
          break;
        }
      }
    }
    if (!Array.isArray(entries) || entries.length === 0) return null;

    const defs = [];
    let pos = "";
    for (const entry of entries) {
      if (!pos && entry.partOfSpeech) pos = entry.partOfSpeech;
      if (Array.isArray(entry.definitions)) {
        for (const d of entry.definitions) {
          if (d?.definition) {
            // Strip HTML tags from Wiktionary definition
            const cleanDef = d.definition
              .replace(/<[^>]+>/g, "")
              .replace(/\s+/g, " ")
              .trim();
            if (cleanDef && defs.length < 3) {
              defs.push(cleanDef);
            }
          }
        }
      }
    }

    if (defs.length === 0) return null;
    return {
      en: defs.join(" • "),
      pos: pos || "word"
    };
  } catch (e) {
    return null;
  }
}

/**
 * Multi-tier Live Dictionary & Translation Lookup for any word or phrase.
 */
async function lookupLiveWordDictionary(word, lang = "fr", contextSentence = "") {
  if (!word || !word.trim()) {
    return { en: "", pos: "word" };
  }

  const candidates = extractCleanLookupCandidates(word, lang);
  let bestResult = null;

  // Tier 1: Try Google GTX on each candidate (raw form, lowercase form, elision-stripped stem)
  for (const cand of candidates) {
    try {
      const gtx = await queryGoogleGtxWord(cand, lang);
      if (gtx && !gtx.isSameAsInput) {
        bestResult = gtx;
        if (gtx.hasDictEntry) break;
      }
    } catch (e) {}
  }

  // Tier 2: Try English Wiktionary if Google GTX didn't have a dictionary entry or returned input unchanged
  if (!bestResult || !bestResult.hasDictEntry) {
    for (const cand of candidates) {
      const wik = await queryWiktionaryDefinition(cand, lang);
      if (wik && wik.en) {
        if (!bestResult || bestResult.isSameAsInput) {
          bestResult = {
            en: wik.en,
            pos: wik.pos,
            romaji: bestResult?.romaji || ""
          };
        } else {
          // Combine GTX primary translation with Wiktionary grammatical note
          bestResult.en = `${bestResult.en} (${wik.en})`;
          if (!bestResult.pos || bestResult.pos === "word") {
            bestResult.pos = wik.pos;
          }
        }
        break;
      }
    }
  }

  // Tier 3: Try auto-detect source language if the user clicked an English or foreign loanword on the page
  if (!bestResult || bestResult.isSameAsInput) {
    try {
      const autoGtx = await queryGoogleGtxWord(candidates[candidates.length - 1], "auto");
      if (autoGtx && !autoGtx.isSameAsInput) {
        bestResult = autoGtx;
      }
    } catch (e) {}
  }

  const cleanWord = candidates[candidates.length - 1] || word.trim();
  const finalEn =
    bestResult && bestResult.en && bestResult.en.toLowerCase() !== word.trim().toLowerCase()
      ? bestResult.en
      : bestResult?.en || cleanWord;

  return {
    en: finalEn,
    pos: bestResult?.pos || "word",
    romaji: bestResult?.romaji || "",
    kana: "",
    ipa: bestResult?.romaji
      ? `/${bestResult.romaji}/`
      : `/${cleanWord.toLowerCase()}/`
  };
}
