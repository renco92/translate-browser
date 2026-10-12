/**
 * Quizzler Web Immersion & Flashcard Studio - Content Script
 * Injects non-destructive DOM translation, word-by-word interactive tokenization,
 * Ruby Furigana / Romaji annotations, inline Sentence Comparator (0-4 star grading),
 * Floating Word Inspector HUD, and 3D Tactile Index Cards Trainer onto any webpage.
 */

(function () {
  "use strict";

  // Avoid running twice or inside extension pages
  if (window.__quizzlerContentInitialized || window.location.protocol === "chrome-extension:") {
    return;
  }
  window.__quizzlerContentInitialized = true;

  const state = {
    isPageTransformed: false,
    mode: null, // 'translated' | 'native' | null
    translatorMode: false,
    detectedPageLang: null,
    activeInspectorWord: null,
    flashcardDeck: [],
    flashcardIndex: 0,
    flashcardFlipped: false,
    flashcardFilter: "all",
    flashcardModalOpen: false,
    revealedBlocks: new Set(),
    pendingSelectionText: "",
    pendingSelectionBlockEl: null,
    toastTimer: null
  };

  async function initContentScript() {
    await window.quizzlerStorage.init();
    state.detectedPageLang = detectPageLanguage();
    applyDocumentLanguageClasses();
    injectFloatingUI();
    syncOverlayBarVisibility();
    bindGlobalEvents();

    window.quizzlerStorage.subscribe(() => {
      applyDocumentLanguageClasses();
      syncOverlayBarVisibility();
      refreshTokenHighlightsOnPage();
      refreshAllParagraphActionBadges();
      updateTranslatorBannerStats();
      updateDockCounters();
      updateDockButtons();
      if (state.activeInspectorWord && window.quizzlerStorage.data.selectedWord) {
        state.activeInspectorWord = window.quizzlerStorage.data.selectedWord;
        renderFloatingInspector();
      }
    });
  }

  function syncOverlayBarVisibility() {
    const dock = document.getElementById("qz-floating-dock");
    if (!dock) return;
    const enabled = window.quizzlerStorage.isOverlayEnabledForPage(window.location.href);
    dock.classList.toggle("qz-dock-visible", enabled);
  }

  function applyDocumentLanguageClasses() {
    const { furiganaMode, showRomaji } = window.quizzlerStorage.data;
    const docEl = document.documentElement;
    docEl.classList.remove("qz-furigana-hover", "qz-furigana-off");
    if (furiganaMode === "hover") {
      docEl.classList.add("qz-furigana-hover");
    } else if (furiganaMode === "off") {
      docEl.classList.add("qz-furigana-off");
    }

    if (showRomaji) {
      docEl.classList.remove("qz-romaji-hidden");
    } else {
      docEl.classList.add("qz-romaji-hidden");
    }
  }

  // ==========================================
  // SMART LANGUAGE DETECTION FOR CURRENT PAGE
  // ==========================================

  function detectPageLanguage() {
    const blocks = collectCandidateBlocks().slice(0, 25);
    const sampleText = blocks
      .map((el) => el.innerText || "")
      .join(" ")
      .slice(0, 5000);

    if (sampleText.length >= 20) {
      // Check for Japanese Kana / Kanji characters
      const jaMatches = sampleText.match(/[\u3040-\u30ff\u4e00-\u9faf]/g);
      if (jaMatches && jaMatches.length >= 8) {
        return "ja";
      }

      const lower = ` ${sampleText.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'")} `;
      const words = lower.match(/[a-zà-ÿœæñß]+/g) || [];
      if (words.length >= 15) {
        const stopwords = {
          fr: new Set([
            "le", "la", "les", "des", "un", "une", "du", "au", "aux", "dans", "pour",
            "pas", "plus", "avec", "sur", "est", "sont", "était", "mais", "comme",
            "cette", "tout", "fait", "nous", "vous", "ils", "elle", "qui", "que",
            "quoi", "dont", "où", "très", "bien", "petit", "même", "aussi", "alors"
          ]),
          es: new Set([
            "el", "la", "los", "las", "un", "una", "del", "al", "en", "por", "para",
            "con", "sin", "sobre", "entre", "está", "son", "era", "pero", "como",
            "esta", "este", "todo", "hace", "nosotros", "ellos", "ella", "que",
            "quien", "donde", "muy", "bien", "también", "cuando", "porque", "más"
          ]),
          de: new Set([
            "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem",
            "und", "in", "mit", "auf", "für", "von", "zu", "ist", "sind", "war",
            "aber", "wie", "diese", "dieser", "alles", "wir", "sie", "ich", "nicht",
            "auch", "noch", "nach", "über", "wenn", "노"
          ]),
          it: new Set([
            "il", "lo", "la", "gli", "le", "un", "una", "del", "della", "nel", "nella",
            "con", "su", "per", "tra", "fra", "è", "sono", "era", "ma", "come",
            "questa", "questo", "tutto", "fatto", "noi", "loro", "lei", "che", "chi",
            "dove", "molto", "bene", "anche", "quando", "perché", "più"
          ]),
          en: new Set([
            "the", "and", "that", "have", "for", "not", "with", "you", "this", "but",
            "his", "from", "they", "say", "her", "she", "will", "one", "all", "would",
            "there", "their", "what", "out", "about", "who", "get", "which", "when"
          ])
        };

        const scores = { fr: 0, es: 0, de: 0, it: 0, en: 0 };
        for (const w of words) {
          for (const [langCode, set] of Object.entries(stopwords)) {
            if (set.has(w)) scores[langCode]++;
          }
        }

        // Boost French elisions (d'un, l'on, qu'il, c'est, j'ai, n'est, s'il)
        const frElisions = lower.match(/\b(c'est|qu'il|d'un|d'une|l'on|j'ai|n'est|s'il|qu'on)\b/g);
        if (frElisions) scores.fr += frElisions.length * 2;

        let bestLang = "en";
        let bestScore = -1;
        for (const [langCode, sc] of Object.entries(scores)) {
          if (sc > bestScore) {
            bestScore = sc;
            bestLang = langCode;
          }
        }

        if (bestScore >= 3) {
          return bestLang;
        }
      }
    }

    const htmlLang = (document.documentElement.getAttribute("lang") || "")
      .toLowerCase()
      .split("-")[0]
      .trim();
    if (["fr", "ja", "es", "de", "it", "en"].includes(htmlLang)) {
      return htmlLang;
    }

    return "en";
  }

  function isPageAlreadyInTargetLang() {
    const targetLang = window.quizzlerStorage.data.targetLang;
    const detected = detectPageLanguage();
    state.detectedPageLang = detected;
    return detected === targetLang;
  }

  // ==========================================
  // TOKENIZATION (FRENCH, JAPANESE & MULTI-LANG)
  // ==========================================

  function tokenizeSentenceHtml(text, lang, contextTarget, contextEn, blockIndex) {
    if (!text) return "";

    if (lang === "ja") {
      const rubyHtml = window.quizzlerStorage.annotateJapaneseWithRuby(text);
      const tokenRegex =
        /(<ruby>.*?<\/ruby>)|([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)|([、。！？「」『』（）…・.,!?:;]+)|(\s+)/g;
      let match;
      let html = "";
      let tokIdx = 0;

      while ((match = tokenRegex.exec(rubyHtml)) !== null) {
        const rubyBlock = match[1];
        const wordBlock = match[2];
        const punct = match[3];
        const space = match[4];

        if (rubyBlock) {
          const baseKanji = rubyBlock
            .replace(/<rt>.*?<\/rt>/g, "")
            .replace(/<[^>]+>/g, "")
            .trim();
          const clean = window.quizzlerStorage.normalizeWordKey(baseKanji, "ja");
          const classes = getTokenClassList(clean, "ja");
          html += `<span class="${classes}" data-qz-raw="${encodeURIComponent(
            baseKanji
          )}" data-qz-clean="${encodeURIComponent(
            clean
          )}" data-qz-lang="ja" data-qz-ctx-target="${encodeURIComponent(
            contextTarget
          )}" data-qz-ctx-en="${encodeURIComponent(
            contextEn
          )}" data-qz-block="${blockIndex}" data-qz-tok="${tokIdx}">${rubyBlock}</span>`;
          tokIdx++;
        } else if (wordBlock) {
          const clean = window.quizzlerStorage.normalizeWordKey(wordBlock, "ja");
          const classes = getTokenClassList(clean, "ja");
          html += `<span class="${classes}" data-qz-raw="${encodeURIComponent(
            wordBlock
          )}" data-qz-clean="${encodeURIComponent(
            clean
          )}" data-qz-lang="ja" data-qz-ctx-target="${encodeURIComponent(
            contextTarget
          )}" data-qz-ctx-en="${encodeURIComponent(
            contextEn
          )}" data-qz-block="${blockIndex}" data-qz-tok="${tokIdx}">${wordBlock}</span>`;
          tokIdx++;
        } else if (punct) {
          html += punct;
        } else if (space) {
          html += space;
        }
      }
      return html;
    }

    // Latin/European scripts (supports straight and curly apostrophes: ', ’, ʼ)
    const tokenRegex =
      /([a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ'’ʼ]+)|([^a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ'’ʼ]+)/g;
    let match;
    let html = "";
    let tokIdx = 0;

    while ((match = tokenRegex.exec(text)) !== null) {
      const word = match[1];
      const sep = match[2];

      if (word) {
        const clean = window.quizzlerStorage.normalizeWordKey(word, lang);
        const classes = getTokenClassList(clean, lang);
        html += `<span class="${classes}" data-qz-raw="${encodeURIComponent(
          word
        )}" data-qz-clean="${encodeURIComponent(
          clean
        )}" data-qz-lang="${lang}" data-qz-ctx-target="${encodeURIComponent(
          contextTarget
        )}" data-qz-ctx-en="${encodeURIComponent(
          contextEn
        )}" data-qz-block="${blockIndex}" data-qz-tok="${tokIdx}">${escapeHtml(word)}</span>`;
        tokIdx++;
      } else if (sep) {
        html += escapeHtml(sep);
      }
    }

    return html;
  }

  function getTokenClassList(cleanWord, lang) {
    const reviewWord = window.quizzlerStorage.getReviewWord(cleanWord, lang);
    let classes = "qz-word-token";
    if (reviewWord) {
      if ((reviewWord.boxLevel || 1) >= 3) {
        classes += " qz-mastered";
      } else {
        classes += " qz-in-review";
      }
    }
    return classes;
  }

  function refreshTokenHighlightsOnPage() {
    const tokens = document.querySelectorAll(".qz-word-token");
    tokens.forEach((tok) => {
      const clean = decodeURIComponent(tok.getAttribute("data-qz-clean") || "");
      const lang = tok.getAttribute("data-qz-lang") || window.quizzlerStorage.data.targetLang;
      tok.classList.remove("qz-in-review", "qz-mastered");
      const reviewWord = window.quizzlerStorage.getReviewWord(clean, lang);
      if (reviewWord) {
        if ((reviewWord.boxLevel || 1) >= 3) {
          tok.classList.add("qz-mastered");
        } else {
          tok.classList.add("qz-in-review");
        }
      }
    });
  }

  // ==========================================
  // PAGE TRANSLATION & NATIVE TOKENIZATION
  // (Preserves all DOM child elements, <br>, <a>, alignment & formatting)
  // ==========================================

  function collectCandidateBlocks() {
    const selectors = "p, h1, h2, h3, h4, li, blockquote, figcaption";
    const all = Array.from(document.querySelectorAll(selectors));
    return all.filter((el) => {
      if (el.closest(".qz-ui-root") || el.closest(".qz-trans-drawer")) return false;
      if (el.closest("nav, footer, script, style, code, pre, svg, button, form")) return false;
      if (el.querySelector("p, h1, h2, h3, h4, ul, ol, table")) return false;

      const text = (el.innerText || "").trim();
      if (text.length < 4) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return true;
    });
  }

  /**
   * Decides whether a block should receive the inline `🔊` + `✍️ Translate` pill.
   * Avoids adding pills to headings, short centered lines, or table-of-contents link lists
   * so page layout and text alignment never shift.
   */
  function shouldAttachParagraphActions(el) {
    const tag = el.tagName.toUpperCase();
    if (tag !== "P" && tag !== "BLOCKQUOTE" && tag !== "LI") return false;

    const totalText = (el.innerText || "").trim();
    if (totalText.length < 18) return false;

    // Skip if element is primarily a list of links (e.g. Table of Contents)
    const links = Array.from(el.querySelectorAll("a"));
    if (links.length > 0) {
      const linkTextLen = links.reduce((acc, a) => acc + (a.innerText || "").trim().length, 0);
      if (linkTextLen > totalText.length * 0.5) return false;
    }

    // Skip centered titles/epigraphs so centering is never offset
    try {
      const style = window.getComputedStyle(el);
      if (style.textAlign === "center") return false;
    } catch (e) {}

    return true;
  }

  /**
   * Collects non-empty DOM Text nodes inside an element while skipping script/style,
   * Quizzler UI elements, and in-page anchor jump links (`<a href="#...">`).
   */
  function getTransformableTextNodes(el) {
    const textNodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (
          parent.closest(
            ".qz-ui-root, .qz-para-actions, .qz-romaji-subline, script, style, code, pre"
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        // Preserve in-page TOC anchor jump links (<a href="#c1">) so clicking jumps to chapter
        const anchor = parent.closest("a[href]");
        if (anchor && (anchor.getAttribute("href") || "").trim().startsWith("#")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let current;
    while ((current = walker.nextNode())) {
      textNodes.push(current);
    }
    return textNodes;
  }

  /**
   * Smart unified entry point: auto-detects whether the page is already in the user's
   * target language. If so, tokenizes in-place; otherwise translates & tokenizes.
   */
  async function smartImmersePage() {
    if (isPageAlreadyInTargetLang()) {
      await tokenizeNativePage();
    } else {
      await translateAndTokenizePage();
    }
  }

  async function translateAndTokenizePage() {
    if (state.isPageTransformed) {
      restoreOriginalPage();
    }

    const lang = window.quizzlerStorage.data.targetLang;
    const langCfg = window.quizzlerStorage.getLangConfig(lang);
    const blocks = collectCandidateBlocks().slice(0, 85);

    if (blocks.length === 0) {
      showToast("No readable text blocks found on this page.");
      return;
    }

    showToast(`${langCfg.flag} Translating ${blocks.length} blocks into ${langCfg.nativeName}...`);
    const btnImmerse = document.getElementById("qz-dock-btn-immerse");
    if (btnImmerse) {
      btnImmerse.textContent = "⏳ Immersing...";
      btnImmerse.disabled = true;
    }

    try {
      const BATCH_SIZE = 10;
      for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batchEls = blocks.slice(i, i + BATCH_SIZE);

        // Collect all transformable text nodes across the batch so child tags (<br>, <a>, <em>) stay intact
        const blockRecords = batchEls.map((el, idx) => {
          const textNodes = getTransformableTextNodes(el);
          return {
            el,
            blockIndex: i + idx,
            origBlockText: (el.innerText || "").trim(),
            textNodes,
            nodeStrings: textNodes.map((n) => n.nodeValue)
          };
        });

        const flatStrings = [];
        blockRecords.forEach((rec) => {
          rec.nodeStrings.forEach((s) => flatStrings.push(s.trim()));
        });

        let translatedFlat = [];
        if (flatStrings.length > 0) {
          const resp = await chrome.runtime.sendMessage({
            type: "TRANSLATE_BATCH",
            texts: flatStrings,
            sourceLang: "auto",
            targetLang: lang
          });
          translatedFlat =
            resp?.results || flatStrings.map((t) => ({ original: t, translated: t }));
        }

        await new Promise((resolve) =>
          requestAnimationFrame(() => {
            let flatCursor = 0;
            blockRecords.forEach((rec) => {
              const { el, blockIndex, origBlockText, textNodes, nodeStrings } = rec;
              if (textNodes.length === 0) return;

              if (!el.hasAttribute("data-qz-orig-html")) {
                el.setAttribute("data-qz-orig-html", el.innerHTML);
                el.setAttribute("data-qz-orig-text", origBlockText);
              }

              const translatedSegments = [];
              const romajiSegments = [];

              textNodes.forEach((textNode, nIdx) => {
                const rawVal = nodeStrings[nIdx];
                const leadMatch = rawVal.match(/^\s*/);
                const trailMatch = rawVal.match(/\s*$/);
                const leadingSpace = leadMatch ? leadMatch[0] : "";
                const trailingSpace = trailMatch ? trailMatch[0] : "";

                const transItem = translatedFlat[flatCursor++] || {
                  translated: rawVal.trim(),
                  romaji: ""
                };
                const translatedCore = transItem.translated || rawVal.trim();
                translatedSegments.push(translatedCore);
                if (transItem.romaji) romajiSegments.push(transItem.romaji);

                const fullNodeTranslated = `${leadingSpace}${translatedCore}${trailingSpace}`;
                const tokenizedHtml = tokenizeSentenceHtml(
                  fullNodeTranslated,
                  lang,
                  translatedCore,
                  rawVal.trim(),
                  blockIndex
                );

                const temp = document.createElement("span");
                temp.innerHTML = tokenizedHtml;
                const frag = document.createDocumentFragment();
                while (temp.firstChild) {
                  frag.appendChild(temp.firstChild);
                }
                textNode.parentNode?.replaceChild(frag, textNode);
              });

              const fullTargetText = translatedSegments.join(" ");
              el.setAttribute("data-qz-block-id", String(blockIndex));
              el.setAttribute("data-qz-target-text", fullTargetText);
              el.setAttribute("data-qz-ref-en", origBlockText);

              if (shouldAttachParagraphActions(el)) {
                appendParagraphActionsAndRomaji(
                  el,
                  blockIndex,
                  lang === "ja" ? romajiSegments.join(" ") : ""
                );
              }
            });
            resolve();
          })
        );

        if (globalThis.scheduler?.yield) {
          await globalThis.scheduler.yield();
        }
      }

      state.isPageTransformed = true;
      state.mode = "translated";
      window.quizzlerStorage.data.stats.pagesTranslated =
        (window.quizzlerStorage.data.stats.pagesTranslated || 0) + 1;
      await window.quizzlerStorage.save();

      window.quizzlerSound.playCorrectChime();
      showToast(
        `${langCfg.flag} Translated & tokenized in ${langCfg.nativeName}! Click any word.`
      );
    } catch (err) {
      console.error("Translate page error:", err);
      showToast("⚠️ Translation error. Tokenizing in-place instead.");
    } finally {
      updateDockButtons();
      updateTranslatorBannerStats();
    }
  }

  async function tokenizeNativePage() {
    if (state.isPageTransformed) {
      restoreOriginalPage();
    }

    const lang = window.quizzlerStorage.data.targetLang;
    const langCfg = window.quizzlerStorage.getLangConfig(lang);
    const blocks = collectCandidateBlocks().slice(0, 120);

    if (blocks.length === 0) {
      showToast("No readable text blocks found on this page.");
      return;
    }

    const BATCH_SIZE = 25;
    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batchEls = blocks.slice(i, i + BATCH_SIZE);
      await new Promise((resolve) =>
        requestAnimationFrame(() => {
          batchEls.forEach((el, idx) => {
            const blockIndex = i + idx;
            tokenizeElementPreservingDom(el, lang, blockIndex);
          });
          resolve();
        })
      );
      if (globalThis.scheduler?.yield) {
        await globalThis.scheduler.yield();
      }
    }

    state.isPageTransformed = true;
    state.mode = "native";
    window.quizzlerSound.playCorrectChime();
    showToast(
      `${langCfg.flag} Immersed ${blocks.length} blocks in ${langCfg.nativeName}! Click any word.`
    );
    updateDockButtons();
    updateTranslatorBannerStats();
  }

  function tokenizeElementPreservingDom(el, lang, blockIndex) {
    const textNodes = getTransformableTextNodes(el);
    if (textNodes.length === 0) return;

    const fullBlockText = (el.innerText || "").trim();
    if (!el.hasAttribute("data-qz-orig-html")) {
      el.setAttribute("data-qz-orig-html", el.innerHTML);
      el.setAttribute("data-qz-orig-text", fullBlockText);
    }
    el.setAttribute("data-qz-block-id", String(blockIndex));
    el.setAttribute("data-qz-target-text", fullBlockText);
    el.setAttribute("data-qz-ref-en", "");

    textNodes.forEach((textNode) => {
      const rawVal = textNode.nodeValue || "";
      const sentenceCtx = rawVal.trim().length >= 12 ? rawVal.trim() : fullBlockText;
      const tokenizedHtml = tokenizeSentenceHtml(rawVal, lang, sentenceCtx, "", blockIndex);
      const temp = document.createElement("span");
      temp.innerHTML = tokenizedHtml;
      const frag = document.createDocumentFragment();
      while (temp.firstChild) {
        frag.appendChild(temp.firstChild);
      }
      textNode.parentNode?.replaceChild(frag, textNode);
    });

    if (shouldAttachParagraphActions(el)) {
      appendParagraphActionsAndRomaji(el, blockIndex, "");
    }
  }

  function getParagraphTranslateButtonLabel(blockIndex) {
    const pageKey = window.quizzlerStorage.getPageKey();
    const saved = window.quizzlerStorage.getPageBlockData(pageKey, blockIndex);
    if (saved && saved.score !== null && saved.score !== undefined) {
      return `✍️ ★${saved.score}/4`;
    }
    if (saved && saved.text && saved.text.trim().length > 0) {
      return "✍️ Draft";
    }
    return "✍️ Translate";
  }

  function refreshAllParagraphActionBadges() {
    const pageKey = window.quizzlerStorage.getPageKey();
    document.querySelectorAll(".qz-btn-compare-para").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-qz-block"));
      const saved = window.quizzlerStorage.getPageBlockData(pageKey, idx);
      btn.textContent = getParagraphTranslateButtonLabel(idx);
      if (saved && saved.score !== null && saved.score !== undefined && saved.score >= 3) {
        btn.style.borderColor = "#10b981";
        btn.style.color = "#6ee7b7";
      } else if (saved && saved.text && saved.text.trim().length > 0) {
        btn.style.borderColor = "#facc15";
        btn.style.color = "#fde047";
      } else {
        btn.style.borderColor = "";
        btn.style.color = "";
      }
    });
  }

  function appendParagraphActionsAndRomaji(el, blockIndex, romajiText) {
    if (el.querySelector(".qz-para-actions")) return;
    const actionsSpan = document.createElement("span");
    actionsSpan.className = "qz-para-actions";
    actionsSpan.setAttribute("contenteditable", "false");
    const btnLabel = getParagraphTranslateButtonLabel(blockIndex);
    actionsSpan.innerHTML = `
      <button type="button" class="qz-para-btn qz-btn-speak-para" data-qz-block="${blockIndex}" title="Listen to pronunciation">
        🔊
      </button>
      <button type="button" class="qz-para-btn qz-btn-compare-para" data-qz-block="${blockIndex}" title="Open Translator Workbench for this block (Translate, Glossary Hints & Diff Check)">
        ${btnLabel}
      </button>
    `;
    el.appendChild(actionsSpan);
    refreshAllParagraphActionBadges();

    if (romajiText) {
      const romajiSpan = document.createElement("span");
      romajiSpan.className = "qz-romaji-subline";
      romajiSpan.textContent = romajiText;
      el.appendChild(romajiSpan);
    }
  }

  function restoreOriginalPage() {
    const transformed = document.querySelectorAll("[data-qz-orig-html]");
    transformed.forEach((el) => {
      el.innerHTML = el.getAttribute("data-qz-orig-html");
      el.removeAttribute("data-qz-orig-html");
      el.removeAttribute("data-qz-orig-text");
      el.removeAttribute("data-qz-block-id");
      el.removeAttribute("data-qz-target-text");
      el.removeAttribute("data-qz-ref-en");
      el.classList.remove("qz-block-active-highlight");
    });

    document.querySelectorAll(".qz-trans-drawer").forEach((d) => d.remove());
    state.isPageTransformed = false;
    state.translatorMode = false;
    state.mode = null;
    syncTranslatorBannerVisibility();
    updateDockButtons();
    showToast("Restored original webpage.");
  }

  // ==========================================
  // TRANSLATOR WORKBENCH MODE & SENTENCE/BLOCK TRANSLATOR
  // ==========================================

  function getTranslatableBlocksOnPage() {
    const existing = Array.from(document.querySelectorAll("[data-qz-block-id]")).filter((el) =>
      shouldAttachParagraphActions(el)
    );
    if (existing.length > 0) return existing;
    return collectCandidateBlocks().filter((el) => shouldAttachParagraphActions(el));
  }

  async function toggleTranslatorMode(forceState) {
    const nextState =
      typeof forceState === "boolean" ? forceState : !state.translatorMode;

    if (nextState && !state.isPageTransformed) {
      await smartImmersePage();
    }

    state.translatorMode = nextState;
    syncTranslatorBannerVisibility();
    updateTranslatorBannerStats();
    updateDockButtons();

    if (nextState) {
      window.quizzlerSound.playCorrectChime();
      showToast(
        "✍️ Translator Workbench Mode ON! Translate blocks below or click 'Next Untranslated'."
      );
      // Automatically open the first untranslated block if no drawer is open yet
      if (document.querySelectorAll(".qz-trans-drawer").length === 0) {
        jumpToNextUntranslatedBlock();
      }
    } else {
      showToast("Closed Translator Workbench banner.");
    }
    return state.translatorMode;
  }

  function syncTranslatorBannerVisibility() {
    const banner = document.getElementById("qz-translator-banner");
    if (!banner) return;
    banner.classList.toggle("qz-banner-visible", Boolean(state.translatorMode));
  }

  function updateTranslatorBannerStats() {
    const banner = document.getElementById("qz-translator-banner");
    if (!banner) return;

    const blocks = getTranslatableBlocksOnPage();
    const pageKey = window.quizzlerStorage.getPageKey();
    const stats = window.quizzlerStorage.getPageTranslationStats(pageKey, blocks.length);

    const summaryEl = document.getElementById("qz-banner-stats-text");
    const avgEl = document.getElementById("qz-banner-avg-score");
    const fillEl = document.getElementById("qz-banner-progress-fill");

    if (summaryEl) {
      summaryEl.textContent = `Translated: ${stats.translatedCount} / ${stats.totalBlocks} blocks (${stats.percentTranslated}%)`;
    }
    if (avgEl) {
      avgEl.textContent =
        stats.scoredCount > 0
          ? `Avg Rating: ★ ${stats.avgScore} / 4 (${stats.scoredCount} graded)`
          : "Grade blocks (0★–4★) as you translate";
    }
    if (fillEl) {
      fillEl.style.width = `${stats.percentTranslated}%`;
    }
  }

  async function jumpToNextUntranslatedBlock(afterBlockIndex = -1) {
    if (!state.isPageTransformed) {
      await smartImmersePage();
    }
    const blocks = getTranslatableBlocksOnPage();
    if (blocks.length === 0) {
      showToast("No translatable text blocks found on this page.");
      return;
    }

    const pageKey = window.quizzlerStorage.getPageKey();
    let targetEl = null;
    let targetIdx = -1;

    // First look after afterBlockIndex
    for (const el of blocks) {
      const idx = Number(el.getAttribute("data-qz-block-id"));
      if (idx > afterBlockIndex) {
        const saved = window.quizzlerStorage.getPageBlockData(pageKey, idx);
        if (!saved?.text || !saved.text.trim()) {
          targetEl = el;
          targetIdx = idx;
          break;
        }
      }
    }

    // Wrap around from beginning if none found after
    if (!targetEl) {
      for (const el of blocks) {
        const idx = Number(el.getAttribute("data-qz-block-id"));
        const saved = window.quizzlerStorage.getPageBlockData(pageKey, idx);
        if (!saved?.text || !saved.text.trim()) {
          targetEl = el;
          targetIdx = idx;
          break;
        }
      }
    }

    // Fallback to next sequential block if all are translated
    if (!targetEl) {
      const nextEl =
        blocks.find((el) => Number(el.getAttribute("data-qz-block-id")) > afterBlockIndex) ||
        blocks[0];
      targetEl = nextEl;
      targetIdx = Number(nextEl.getAttribute("data-qz-block-id"));
    }

    if (targetEl && targetIdx >= 0) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      await toggleParagraphComparator(targetEl, targetIdx, { forceOpen: true, focusInput: true });
    }
  }

  async function expandAllBlockWorkbenches() {
    if (!state.isPageTransformed) {
      await smartImmersePage();
    }
    const blocks = getTranslatableBlocksOnPage().slice(0, 15);
    for (const el of blocks) {
      const idx = Number(el.getAttribute("data-qz-block-id"));
      await toggleParagraphComparator(el, idx, { forceOpen: true, focusInput: false });
    }
    showToast(`📂 Opened Translator Workbench for ${blocks.length} blocks.`);
  }

  function collapseAllBlockWorkbenches() {
    document.querySelectorAll(".qz-trans-drawer").forEach((d) => d.remove());
    document
      .querySelectorAll(".qz-block-active-highlight")
      .forEach((el) => el.classList.remove("qz-block-active-highlight"));
    showToast("📁 Collapsed all open translation workbenches.");
  }

  async function exportBilingualManuscript() {
    const blocks = getTranslatableBlocksOnPage();
    const pageKey = window.quizzlerStorage.getPageKey();
    const lang = window.quizzlerStorage.data.targetLang;
    const langCfg = window.quizzlerStorage.getLangConfig(lang);

    const lines = [
      `# Bilingual Translation Manuscript: ${document.title || window.location.hostname}`,
      `- **Source URL**: ${window.location.href}`,
      `- **Language**: ${langCfg.flag} ${langCfg.name} (${langCfg.nativeName})`,
      `- **Exported**: ${new Date().toLocaleString()}`,
      ""
    ];

    let count = 0;
    blocks.forEach((el, i) => {
      const idx = Number(el.getAttribute("data-qz-block-id") ?? i);
      const saved = window.quizzlerStorage.getPageBlockData(pageKey, idx);
      const sourceText =
        (el.getAttribute("data-qz-target-text") || saved?.sourceText || el.innerText || "").trim();
      const refText = (el.getAttribute("data-qz-ref-en") || saved?.referenceText || "").trim();
      const userDraft = (saved?.text || "").trim();

      if (userDraft || saved?.score !== null) {
        count++;
        lines.push(`### Block #${idx + 1}${saved?.score !== null ? ` (★ ${saved.score}/4)` : ""}`);
        lines.push(`> **Source (${lang.toUpperCase()})**: ${sourceText}`);
        lines.push("");
        lines.push(`- **My Translation**: ${userDraft || "_No draft entered_"}`);
        if (refText) {
          lines.push(`- **Reference (EN)**: ${refText}`);
        }
        lines.push("");
      }
    });

    // Also include any saved blocks on this pageKey even if page isn't currently transformed
    if (count === 0) {
      const rawMap = window.quizzlerStorage.data.pageTranslations?.[pageKey] || {};
      Object.entries(rawMap).forEach(([idx, saved]) => {
        if (saved?.text || saved?.score !== null) {
          count++;
          lines.push(
            `### Block #${Number(idx) + 1}${saved?.score !== null ? ` (★ ${saved.score}/4)` : ""}`
          );
          if (saved.sourceText) lines.push(`> **Source**: ${saved.sourceText}`);
          lines.push(`- **My Translation**: ${saved.text || "_No draft_"}`);
          if (saved.referenceText) lines.push(`- **Reference**: ${saved.referenceText}`);
          lines.push("");
        }
      });
    }

    if (count === 0) {
      showToast("⚠️ Translate at least one block first to export your manuscript!");
      return { ok: false, count: 0, markdown: "" };
    }

    const markdown = lines.join("\n");
    try {
      await navigator.clipboard.writeText(markdown);
      window.quizzlerSound.playCorrectChime();
      showToast(`📄 Copied Bilingual Manuscript (${count} blocks) to clipboard!`);
    } catch (e) {
      showToast(`📄 Generated Bilingual Manuscript (${count} blocks).`);
    }
    return { ok: true, count, markdown };
  }

  /**
   * Extracts up to 8 key vocabulary words from a source block for the Translator Glossary Hints bar.
   */
  function extractBlockGlossaryCandidates(sourceText, lang) {
    if (!sourceText) return [];
    if (lang === "ja") {
      const matches = sourceText.match(/[一-龯々〆ヵヶ]{1,4}[ぁ-ん]{0,2}|[ァ-ヶー]{2,}/g) || [];
      return Array.from(new Set(matches)).slice(0, 8);
    }
    const rawWords = sourceText.match(/[a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ'’ʼ]{4,}/g) || [];
    const seen = new Set();
    const candidates = [];
    for (const w of rawWords) {
      const clean = window.quizzlerStorage.normalizeWordKey(w, lang);
      if (!clean || clean.length < 4 || seen.has(clean)) continue;
      seen.add(clean);
      candidates.push(w);
      if (candidates.length >= 8) break;
    }
    return candidates;
  }

  function renderDiffHighlightedReference(userText, refEn) {
    if (!refEn) return escapeHtml("Reference translation unavailable.");
    if (!userText || !userText.trim()) {
      return escapeHtml(refEn);
    }
    const evalResult = window.quizzlerStorage.evaluateTranslationMatch(userText, refEn);
    if (!evalResult.refDiffTokens || evalResult.refDiffTokens.length === 0) {
      return escapeHtml(refEn);
    }
    return evalResult.refDiffTokens
      .map((tok) => {
        if (tok.status === "matched") {
          return `<span class="qz-diff-token-matched" title="Matched key word in your translation">${escapeHtml(
            tok.text
          )}</span>`;
        }
        if (tok.status === "missed") {
          return `<span class="qz-diff-token-missed" title="Missed or paraphrased key word from reference">${escapeHtml(
            tok.text
          )}</span>`;
        }
        return escapeHtml(tok.text);
      })
      .join("");
  }

  /**
   * Opens or toggles the interactive Block Translator Workbench under any block on the page.
   * Supports arbitrary un-tokenized blocks as well (tokenizing them on the fly).
   */
  async function toggleParagraphComparator(blockEl, blockIndex, options = {}) {
    if (!blockEl) return;

    const lang = window.quizzlerStorage.data.targetLang;

    // If this single block hasn't been tokenized yet (e.g. triggered from text selection),
    // tokenize just this block in-place so the user can click words and translate it right away!
    if (!blockEl.hasAttribute("data-qz-block-id")) {
      const assignedIdx =
        typeof blockIndex === "number" && !Number.isNaN(blockIndex)
          ? blockIndex
          : document.querySelectorAll("[data-qz-block-id]").length + 500;
      blockIndex = assignedIdx;
      tokenizeElementPreservingDom(blockEl, lang, blockIndex);
    }

    const existingId = `qz-drawer-${blockIndex}`;
    const existing = document.getElementById(existingId);
    if (existing) {
      if (options.forceOpen) {
        if (options.focusInput) {
          existing.querySelector(".qz-trans-input")?.focus();
        }
        return;
      }
      existing.remove();
      blockEl.classList.remove("qz-block-active-highlight");
      return;
    }

    blockEl.classList.add("qz-block-active-highlight");

    const pageKey = window.quizzlerStorage.getPageKey();
    const savedBlock = window.quizzlerStorage.getPageBlockData(pageKey, blockIndex);
    const targetText =
      blockEl.getAttribute("data-qz-target-text") || (blockEl.innerText || "").trim();
    let refEn = blockEl.getAttribute("data-qz-ref-en") || savedBlock.referenceText || "";

    // Fetch reference English translation on demand if not cached yet
    if (!refEn && targetText) {
      try {
        const res = await chrome.runtime.sendMessage({
          type: "TRANSLATE_SINGLE",
          text: targetText,
          sourceLang: lang,
          targetLang: "en"
        });
        if (res?.translatedText) {
          refEn = res.translatedText;
          blockEl.setAttribute("data-qz-ref-en", refEn);
        }
      } catch (e) {}
    }

    const immersionMode = window.quizzlerStorage.data.immersionMode;
    const isRevealed =
      !immersionMode ||
      state.revealedBlocks.has(blockIndex) ||
      Boolean(savedBlock.text && savedBlock.text.trim());

    const drawer = document.createElement("div");
    drawer.id = existingId;
    drawer.className = "qz-trans-drawer";

    const starLabels = [
      { s: 0, label: "0★ No clue" },
      { s: 1, label: "1★ 1-2 words" },
      { s: 2, label: "2★ Gist" },
      { s: 3, label: "3★ Close" },
      { s: 4, label: "4★ Flawless" }
    ];

    const initialEval =
      savedBlock.text && refEn
        ? window.quizzlerStorage.evaluateTranslationMatch(savedBlock.text, refEn)
        : null;

    drawer.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="qz-label-mono" style="color:#facc15;">✍️ Block #${
            blockIndex + 1
          } Translator Workbench</span>
          <span class="qz-badge qz-match-badge" style="display:${
            initialEval ? "inline-block" : "none"
          };border-color:rgba(16,185,129,0.5);color:#6ee7b7;">
            ${initialEval ? `🎯 ${initialEval.matchPct}% Match` : ""}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
          <button type="button" class="qz-para-btn qz-btn-glossary-hints" title="Show vocabulary hints for key words in this block before revealing the full translation">
            💡 Glossary Hints
          </button>
          <button type="button" class="qz-para-btn qz-btn-speak-drawer" title="Listen to this block in target language">
            🔊 Listen
          </button>
          <button type="button" class="qz-para-btn qz-drawer-close" style="padding:1px 7px;" title="Close workbench">✕</button>
        </div>
      </div>

      <!-- Collapsible Vocabulary Glossary Hints Bar -->
      <div class="qz-glossary-box" style="display:none;"></div>

      <textarea class="qz-trans-input" placeholder="Write your English translation of this passage... (Press Ctrl+Enter or click 'Check & Compare' to see word-by-word diff & accuracy score)">${escapeHtml(
        savedBlock.text || ""
      )}</textarea>

      <div class="qz-drawer-row">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button type="button" class="qz-para-btn qz-btn-check-diff" style="background:#eab308;color:#090a0f !important;border-color:#facc15;font-weight:800;padding:4px 11px;">
            🔍 Check & Compare
          </button>
          <button type="button" class="qz-para-btn qz-btn-reveal-ref">
            ${isRevealed ? "🙈 Hide Reference" : "👁️ Peek Reference"}
          </button>
          <button type="button" class="qz-para-btn qz-btn-next-block" title="Save and jump to the next block on the page">
            Next Block →
          </button>
        </div>
        <div class="qz-star-bar">
          ${starLabels
            .map(
              (item) => `
            <button type="button" class="qz-star-btn ${
              savedBlock.score === item.s ? "qz-active" : ""
            }" data-score="${item.s}">
              ${item.label}
            </button>
          `
            )
            .join("")}
        </div>
      </div>

      <div class="qz-ref-box" style="display:${isRevealed ? "block" : "none"};">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
          <span class="qz-label-mono" style="color:#34d399;">Reference English Translation & Word Diff</span>
          <span style="font-size:10.5px;color:#a1a1aa;">
            <span class="qz-diff-token-matched" style="font-size:10px;">Matched</span> •
            <span class="qz-diff-token-missed" style="font-size:10px;">Missed / Paraphrased</span>
          </span>
        </div>
        <div class="qz-ref-text">${renderDiffHighlightedReference(
          savedBlock.text || "",
          refEn
        )}</div>
      </div>
    `;

    blockEl.insertAdjacentElement("afterend", drawer);

    const textarea = drawer.querySelector(".qz-trans-input");
    const refBox = drawer.querySelector(".qz-ref-box");
    const refTextEl = drawer.querySelector(".qz-ref-text");
    const btnReveal = drawer.querySelector(".qz-btn-reveal-ref");
    const matchBadge = drawer.querySelector(".qz-match-badge");
    const glossaryBox = drawer.querySelector(".qz-glossary-box");

    if (options.focusInput) {
      setTimeout(() => textarea?.focus(), 60);
    }

    textarea.addEventListener("input", async () => {
      await window.quizzlerStorage.savePageBlockTranslation(
        pageKey,
        blockIndex,
        textarea.value,
        targetText,
        refEn
      );
      refreshAllParagraphActionBadges();
      updateTranslatorBannerStats();
      if (state.revealedBlocks.has(blockIndex) && refTextEl) {
        refTextEl.innerHTML = renderDiffHighlightedReference(textarea.value, refEn);
      }
    });

    const runCheckAndCompare = async () => {
      const userDraft = textarea.value.trim();
      await window.quizzlerStorage.savePageBlockTranslation(
        pageKey,
        blockIndex,
        userDraft,
        targetText,
        refEn
      );

      state.revealedBlocks.add(blockIndex);
      refBox.style.display = "block";
      btnReveal.textContent = "🙈 Hide Reference";

      const evalRes = window.quizzlerStorage.evaluateTranslationMatch(userDraft, refEn);
      if (refTextEl) {
        refTextEl.innerHTML = renderDiffHighlightedReference(userDraft, refEn);
      }

      if (matchBadge && userDraft) {
        matchBadge.style.display = "inline-block";
        matchBadge.textContent = `🎯 ${evalRes.matchPct}% Match (${evalRes.matchedCount}/${evalRes.totalRefWords} key words)`;
      }

      // Auto-suggest star score if user wrote a draft
      if (userDraft && evalRes.suggestedScore !== null) {
        const currentSaved = window.quizzlerStorage.getPageBlockData(pageKey, blockIndex);
        const scoreToApply =
          currentSaved.score !== null && currentSaved.score !== undefined
            ? currentSaved.score
            : evalRes.suggestedScore;

        await window.quizzlerStorage.savePageBlockScore(
          pageKey,
          blockIndex,
          scoreToApply,
          targetText,
          refEn
        );
        drawer.querySelectorAll(".qz-star-btn").forEach((b) => {
          b.classList.toggle("qz-active", Number(b.getAttribute("data-score")) === scoreToApply);
        });
        if (scoreToApply >= 3) {
          window.quizzlerSound.playCorrectChime();
        } else {
          window.quizzlerSound.playHintChime();
        }
        showToast(
          `🎯 ${evalRes.matchPct}% Keyword Match! Rated ★ ${scoreToApply}/4 (Click 0★–4★ to adjust)`
        );
      } else {
        window.quizzlerSound.playHintChime();
      }

      refreshAllParagraphActionBadges();
      updateTranslatorBannerStats();
    };

    textarea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runCheckAndCompare();
      }
    });

    drawer.querySelector(".qz-btn-check-diff")?.addEventListener("click", runCheckAndCompare);

    drawer.querySelector(".qz-btn-speak-drawer")?.addEventListener("click", () => {
      window.quizzlerSound.speak(targetText, lang);
    });

    drawer.querySelector(".qz-btn-next-block")?.addEventListener("click", () => {
      jumpToNextUntranslatedBlock(blockIndex);
    });

    drawer.querySelector(".qz-btn-glossary-hints")?.addEventListener("click", async () => {
      if (!glossaryBox) return;
      if (glossaryBox.style.display === "flex") {
        glossaryBox.style.display = "none";
        return;
      }
      glossaryBox.style.display = "flex";
      if (glossaryBox.getAttribute("data-loaded") === "1") return;

      const candidates = extractBlockGlossaryCandidates(targetText, lang);
      if (candidates.length === 0) {
        glossaryBox.innerHTML = `<span style="font-size:11px;color:#a1a1aa;">Click any word in the paragraph above to inspect its definition.</span>`;
        return;
      }

      glossaryBox.innerHTML = `<span style="font-size:11px;color:#facc15;">⏳ Loading vocabulary glossary for this block...</span>`;
      const chipsHtml = [];

      for (const word of candidates) {
        const meta = await window.quizzlerStorage.lookupWordWithLiveFallback(
          word,
          lang,
          targetText,
          refEn
        );
        if (meta && meta.en) {
          chipsHtml.push(`
            <span class="qz-glossary-chip" data-word="${encodeURIComponent(meta.word)}">
              <strong style="color:#fde047;">${escapeHtml(meta.word)}</strong>
              <span style="color:#a1a1aa;">→</span>
              <span style="color:#f4f4f5;">${escapeHtml(meta.en)}</span>
            </span>
          `);
        }
      }

      glossaryBox.setAttribute("data-loaded", "1");
      glossaryBox.innerHTML =
        chipsHtml.length > 0
          ? chipsHtml.join("")
          : `<span style="font-size:11px;color:#a1a1aa;">Click any word in the paragraph above for instant dictionary lookup.</span>`;

      glossaryBox.querySelectorAll(".qz-glossary-chip").forEach((chip) => {
        chip.addEventListener("click", async () => {
          const w = decodeURIComponent(chip.getAttribute("data-word") || "");
          if (!w) return;
          const fullMeta = await window.quizzlerStorage.lookupWordWithLiveFallback(
            w,
            lang,
            targetText,
            refEn
          );
          if (fullMeta) {
            state.activeInspectorWord = fullMeta;
            await window.quizzlerStorage.setSelectedWord(fullMeta);
            window.quizzlerSound.speak(fullMeta.word, lang);
            renderFloatingInspector();
          }
        });
      });
    });

    const btnClose = drawer.querySelector(".qz-drawer-close");
    btnClose.addEventListener("click", () => {
      drawer.remove();
      blockEl.classList.remove("qz-block-active-highlight");
    });

    btnReveal.addEventListener("click", () => {
      if (state.revealedBlocks.has(blockIndex)) {
        state.revealedBlocks.delete(blockIndex);
        refBox.style.display = "none";
        btnReveal.textContent = "👁️ Peek Reference";
      } else {
        state.revealedBlocks.add(blockIndex);
        refBox.style.display = "block";
        btnReveal.textContent = "🙈 Hide Reference";
        if (refTextEl) {
          refTextEl.innerHTML = renderDiffHighlightedReference(textarea.value, refEn);
        }
        window.quizzlerSound.playHintChime();
      }
    });

    drawer.querySelectorAll(".qz-star-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const score = Number(btn.getAttribute("data-score"));
        await window.quizzlerStorage.savePageBlockScore(
          pageKey,
          blockIndex,
          score,
          targetText,
          refEn
        );
        drawer.querySelectorAll(".qz-star-btn").forEach((b) => b.classList.remove("qz-active"));
        btn.classList.add("qz-active");
        refreshAllParagraphActionBadges();
        updateTranslatorBannerStats();
        if (score >= 3) {
          window.quizzlerSound.playCorrectChime();
        } else {
          window.quizzlerSound.playTone(440, 0.12, "triangle", 0.12);
        }
        showToast(`Saved self-rating: ★ ${score} / 4`);
      });
    });
  }

  // ==========================================
  // FLOATING UI: DOCK, INSPECTOR HUD & 3D MODAL
  // ==========================================

  function injectFloatingUI() {
    if (document.getElementById("qz-ui-container")) return;

    const root = document.createElement("div");
    root.id = "qz-ui-container";
    root.className = "qz-ui-root";

    root.innerHTML = `
      <!-- Floating Toast -->
      <div id="qz-toast">
        <span style="width:8px;height:8px;border-radius:999px;background:#facc15;display:inline-block;"></span>
        <span id="qz-toast-msg">Quizzler Ready</span>
      </div>

      <!-- Right Floating Word & Kanji Inspector HUD -->
      <aside id="qz-floating-inspector">
        <div class="qz-insp-header">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <h3 id="qz-insp-word" class="qz-insp-word">mot</h3>
              <button type="button" id="qz-insp-audio" class="qz-icon-btn" title="Listen to native pronunciation">
                🔊
              </button>
            </div>
            <div id="qz-insp-phonetic" style="font-size:12px;font-family:monospace;color:#facc15;margin-top:3px;">/mɔ/</div>
            <div id="qz-insp-romaji" style="font-size:11px;font-family:monospace;color:#a1a1aa;display:none;"></div>
          </div>
          <button type="button" id="qz-insp-close" class="qz-icon-btn" title="Close Inspector">✕</button>
        </div>

        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span id="qz-insp-pos" class="qz-badge">Noun</span>
          <span id="qz-insp-status" style="font-size:11px;font-family:monospace;color:#a1a1aa;">Not in vault</span>
        </div>

        <!-- English Definition Box + Custom Definition Editor -->
        <div class="qz-card-box">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span class="qz-label-mono">English Translation <span id="qz-insp-custom-tag" style="color:#facc15;display:none;">• CUSTOM</span></span>
            <div style="display:flex;gap:4px;">
              <button type="button" id="qz-btn-edit-def" class="qz-para-btn" style="padding:1px 6px;font-size:10px;">Edit</button>
              <button type="button" id="qz-btn-reset-def" class="qz-para-btn" style="padding:1px 6px;font-size:10px;display:none;">Reset</button>
            </div>
          </div>
          <div id="qz-insp-en" style="font-size:16px;font-weight:800;color:#fde047;">word</div>

          <div id="qz-insp-edit-form" style="display:none;margin-top:8px;">
            <input type="text" id="qz-insp-edit-input" class="qz-trans-input" style="min-height:32px;margin-top:0;" placeholder="Enter custom definition..." />
            <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px;">
              <button type="button" id="qz-btn-cancel-def" class="qz-dock-btn" style="padding:3px 8px;font-size:11px;">Cancel</button>
              <button type="button" id="qz-btn-save-def" class="qz-dock-btn qz-primary" style="padding:3px 10px;font-size:11px;">Save</button>
            </div>
          </div>
        </div>

        <!-- Context Sentence Card -->
        <div id="qz-insp-ctx-box" class="qz-card-box">
          <span class="qz-label-mono" style="margin-bottom:4px;">Context Sentence</span>
          <div id="qz-insp-ctx-target" style="font-size:12.5px;color:#e4e4e7;font-style:italic;"></div>
          <div id="qz-insp-ctx-en" style="font-size:11.5px;color:#a1a1aa;margin-top:4px;"></div>
        </div>

        <!-- Japanese Kanji Breakdown OR French Idiom Detector -->
        <div id="qz-insp-extra-box" class="qz-card-box" style="display:none;"></div>

        <!-- Vault Action Buttons -->
        <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;">
          <button type="button" id="qz-btn-toggle-vault" class="qz-dock-btn qz-primary" style="width:100%;justify-content:center;padding:9px 12px;font-size:12.5px;">
            ⭐ + Add to Flashcards Deck
          </button>
          <div style="display:flex;gap:6px;">
            <button type="button" id="qz-btn-open-cards-from-insp" class="qz-dock-btn" style="flex:1;justify-content:center;padding:7px 10px;">
              🗂️ Practice 3D Cards
            </button>
            <button type="button" id="qz-btn-open-sidepanel-from-insp" class="qz-dock-btn" style="flex:1;justify-content:center;padding:7px 10px;">
              📐 Side Panel
            </button>
          </div>
        </div>
      </aside>

      <!-- On-Page 3D Tactile Flashcards Modal -->
      <div id="qz-modal-flashcards">
        <div class="qz-modal-card">
          <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(63,63,70,0.7);padding-bottom:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:22px;">🗂️</span>
              <div>
                <div style="font-weight:800;font-size:16px;color:#fff;display:flex;align-items:center;gap:8px;">
                  <span>Quizzler 3D Index Cards</span>
                  <span id="qz-card-progress" class="qz-badge">1 / 5</span>
                </div>
                <div style="font-size:11px;color:#a1a1aa;">[Space] Flip • [1] Hard • [2] Good • [3] Easy • [A] Audio • [←/→] Nav</div>
              </div>
            </div>
            <button type="button" id="qz-modal-close" class="qz-icon-btn">✕</button>
          </div>

          <!-- Filter Tabs -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:6px;">
            <div style="display:flex;gap:4px;">
              <button type="button" class="qz-dock-btn qz-card-filter" data-filter="all" style="padding:4px 10px;font-size:11px;">All</button>
              <button type="button" class="qz-dock-btn qz-card-filter" data-filter="learning" style="padding:4px 10px;font-size:11px;">Learning</button>
              <button type="button" class="qz-dock-btn qz-card-filter" data-filter="mastered" style="padding:4px 10px;font-size:11px;">Mastered</button>
            </div>
            <button type="button" id="qz-card-shuffle" class="qz-dock-btn" style="padding:4px 10px;font-size:11px;">🔀 Shuffle</button>
          </div>

          <!-- 3D Flipper -->
          <div class="qz-card-scene">
            <div id="qz-card-flipper" class="qz-card-3d">
              <!-- FRONT -->
              <div class="qz-card-face qz-card-face-front">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <span id="qz-card-level" class="qz-badge">Level 1 • Learning</span>
                  <button type="button" id="qz-card-audio" class="qz-icon-btn" title="Replay Audio [A]">🔊</button>
                </div>
                <div style="text-align:center;margin:auto 0;">
                  <div id="qz-card-front-word" style="font-size:32px;font-weight:900;color:#fff;">le prince</div>
                  <div id="qz-card-front-phonetic" style="font-size:13px;font-family:monospace;color:#facc15;margin-top:4px;">/pʁɛ̃s/</div>
                  <span id="qz-card-front-pos" class="qz-badge" style="margin-top:8px;">noun</span>
                </div>
                <div style="padding:10px;border-radius:14px;background:rgba(9,10,15,0.85);border:1px solid rgba(63,63,70,0.6);text-align:center;">
                  <div id="qz-card-front-ctx" style="font-size:12.5px;color:#d4d4d8;font-style:italic;">« S'il vous plaît... dessine-moi un mouton ! »</div>
                </div>
                <div style="text-align:center;font-size:10.5px;font-family:monospace;color:#71717a;">
                  Click card or press [Space] to reveal translation
                </div>
              </div>

              <!-- BACK -->
              <div class="qz-card-face qz-card-face-back">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <span class="qz-label-mono" style="color:#facc15;">English Meaning & Context</span>
                  <span id="qz-card-back-word" style="font-weight:800;color:#fff;font-size:15px;">le prince</span>
                </div>
                <div style="text-align:center;margin:auto 0;">
                  <div id="qz-card-back-en" style="font-size:26px;font-weight:900;color:#fde047;">prince</div>
                  <div id="qz-card-back-sub" style="font-size:12px;color:#a1a1aa;margin-top:4px;"></div>
                </div>
                <div style="padding:10px;border-radius:14px;background:rgba(9,10,15,0.85);border:1px solid rgba(63,63,70,0.6);text-align:center;">
                  <div id="qz-card-back-ctx-target" style="font-size:12.5px;color:#e4e4e7;font-style:italic;"></div>
                  <div id="qz-card-back-ctx-en" style="font-size:11.5px;color:#a1a1aa;margin-top:4px;"></div>
                </div>
                <div style="text-align:center;font-size:10.5px;font-family:monospace;color:#a1a1aa;">
                  Grade your recall with [1], [2], or [3] below:
                </div>
              </div>
            </div>
          </div>

          <!-- Leitner Rating Bar -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            <button type="button" id="qz-rate-1" class="qz-dock-btn" style="justify-content:center;border-color:rgba(239,68,68,0.5);color:#fca5a5;padding:9px;">
              [1] Hard / Again
            </button>
            <button type="button" id="qz-rate-2" class="qz-dock-btn" style="justify-content:center;border-color:rgba(250,204,21,0.5);color:#fde047;padding:9px;">
              [2] Good
            </button>
            <button type="button" id="qz-rate-3" class="qz-dock-btn" style="justify-content:center;border-color:rgba(16,185,129,0.5);color:#6ee7b7;padding:9px;">
              [3] Easy / Mastered
            </button>
          </div>

          <div style="display:flex;justify-content:space-between;margin-top:10px;">
            <button type="button" id="qz-card-prev" class="qz-dock-btn" style="padding:4px 12px;font-size:11px;">← Prev</button>
            <button type="button" id="qz-card-next" class="qz-dock-btn" style="padding:4px 12px;font-size:11px;">Next →</button>
          </div>
        </div>
      </div>

      <!-- Sticky Top Translator Workbench Progress & Star Score Banner -->
      <div id="qz-translator-banner">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="qz-badge" style="background:rgba(250,204,21,0.2);border-color:#facc15;color:#fde047;padding:3px 9px;">
              ✍️ Translator Workbench
            </span>
            <span id="qz-banner-stats-text" style="font-size:12.5px;font-weight:700;color:#fff;">
              Translated: 0 / 0 blocks (0%)
            </span>
            <span id="qz-banner-avg-score" style="font-size:11.5px;font-family:monospace;color:#6ee7b7;">
              Grade blocks (0★–4★) as you translate
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <button type="button" id="qz-banner-btn-next" class="qz-dock-btn qz-primary" style="padding:4px 10px;font-size:11px;" title="Jump to the next untranslated block on this page">
              🎯 Next Untranslated
            </button>
            <button type="button" id="qz-banner-btn-expand" class="qz-dock-btn" style="padding:4px 9px;font-size:11px;" title="Open Translator Workbench for blocks on this page">
              📂 Expand All
            </button>
            <button type="button" id="qz-banner-btn-collapse" class="qz-dock-btn" style="padding:4px 9px;font-size:11px;" title="Collapse open Translator Workbenches">
              📁 Collapse
            </button>
            <button type="button" id="qz-banner-btn-export" class="qz-dock-btn" style="padding:4px 9px;font-size:11px;" title="Copy your Bilingual Translation Manuscript (Markdown) to clipboard">
              📄 Export Manuscript
            </button>
            <button type="button" id="qz-banner-btn-close" class="qz-dock-btn" style="padding:4px 8px;font-size:11px;color:#a1a1aa;" title="Hide Translator Banner">
              ✕
            </button>
          </div>
        </div>
        <div class="qz-banner-progress-track">
          <div id="qz-banner-progress-fill" class="qz-banner-progress-fill"></div>
        </div>
      </div>

      <!-- Floating Selection Action Pill (Appears when highlighting a block or phrase) -->
      <div id="qz-selection-pill">
        <button type="button" id="qz-sel-btn-translate" class="qz-para-btn" style="background:#eab308;color:#090a0f !important;border-color:#facc15;font-weight:800;padding:4px 10px;">
          ✍️ Translate Block
        </button>
        <button type="button" id="qz-sel-btn-inspect" class="qz-para-btn" style="padding:4px 9px;">
          📖 Inspect
        </button>
      </div>

      <!-- Bottom-Right Floating Quizzler Control Dock (Hidden by default unless enabled on site) -->
      <div id="qz-floating-dock">
        <select id="qz-dock-lang" class="qz-dock-select" title="Select Target Learning Language">
          <option value="fr">🇫🇷 FR</option>
          <option value="ja">🇯🇵 JA</option>
          <option value="es">🇪🇸 ES</option>
          <option value="de">🇩🇪 DE</option>
          <option value="it">🇮🇹 IT</option>
        </select>

        <button type="button" id="qz-dock-btn-immerse" class="qz-dock-btn qz-primary" title="Auto-detects page language: tokenizes in-place if already in target language, or translates & tokenizes">
          ✨ Immerse Page
        </button>

        <button type="button" id="qz-dock-btn-translator" class="qz-dock-btn" title="Toggle Translator Workbench Mode (Translate blocks & track accuracy score)">
          ✍️ Translator
        </button>

        <button type="button" id="qz-dock-btn-restore" class="qz-dock-btn" style="display:none;" title="Restore original webpage">
          🔄 Restore
        </button>

        <button type="button" id="qz-dock-btn-furigana" class="qz-dock-btn" style="display:none;" title="Cycle Japanese Furigana display (Always / Hover / Off)">
          あ Furigana: Always
        </button>

        <button type="button" id="qz-dock-btn-bookmark" class="qz-dock-btn" title="Bookmark this page for language learning">
          🔖
        </button>

        <button type="button" id="qz-dock-btn-cards" class="qz-dock-btn" title="Practice 3D Flashcards on this page">
          🗂️ <span id="qz-dock-card-count">5</span>
        </button>

        <button type="button" id="qz-dock-btn-sidepanel" class="qz-dock-btn" title="Open Quizzler Side Panel">
          📐 Panel
        </button>

        <button type="button" id="qz-dock-btn-hide" class="qz-dock-btn" style="padding:6px 9px;color:#a1a1aa;" title="Hide overlay bar on this site (Re-enable anytime from Side Panel)">
          ✕
        </button>
      </div>
    `;

    document.body.appendChild(root);
    updateDockCounters();
    updateDockButtons();
  }

  function updateDockCounters() {
    const lang = window.quizzlerStorage.data.targetLang;
    const langSelect = document.getElementById("qz-dock-lang");
    if (langSelect && langSelect.value !== lang) {
      langSelect.value = lang;
    }

    const stats = window.quizzlerStorage.getVaultStats(lang);
    const countEl = document.getElementById("qz-dock-card-count");
    if (countEl) {
      countEl.textContent = `${stats.total}`;
    }

    const furiBtn = document.getElementById("qz-dock-btn-furigana");
    if (furiBtn) {
      furiBtn.style.display = lang === "ja" ? "inline-flex" : "none";
      const mode = window.quizzlerStorage.data.furiganaMode;
      furiBtn.textContent = `あ Furigana: ${
        mode === "always" ? "Always" : mode === "hover" ? "Hover" : "Off"
      }`;
    }
  }

  function updateDockButtons() {
    const btnImmerse = document.getElementById("qz-dock-btn-immerse");
    const btnTranslator = document.getElementById("qz-dock-btn-translator");
    const btnRestore = document.getElementById("qz-dock-btn-restore");
    const btnBookmark = document.getElementById("qz-dock-btn-bookmark");
    const lang = window.quizzlerStorage.data.targetLang;
    const langCfg = window.quizzlerStorage.getLangConfig(lang);
    const isNative = isPageAlreadyInTargetLang();

    if (btnImmerse) {
      btnImmerse.disabled = false;
      if (state.isPageTransformed) {
        btnImmerse.textContent =
          state.mode === "native"
            ? `✨ Immersed (${lang.toUpperCase()} Native)`
            : `✨ Immersed (→ ${lang.toUpperCase()})`;
      } else {
        btnImmerse.textContent = isNative
          ? `✨ Immerse (${langCfg.flag} Native)`
          : `✨ Translate & Immerse (${langCfg.flag})`;
      }
    }
    if (btnTranslator) {
      btnTranslator.textContent = state.translatorMode ? "✍️ Translator: ON" : "✍️ Translator";
      btnTranslator.style.borderColor = state.translatorMode ? "#facc15" : "";
      btnTranslator.style.color = state.translatorMode ? "#fde047" : "";
    }
    if (btnRestore) {
      btnRestore.style.display = state.isPageTransformed ? "inline-flex" : "none";
    }
    if (btnBookmark) {
      const saved = window.quizzlerStorage.isUrlBookmarked(window.location.href);
      btnBookmark.textContent = saved ? "🔖 Saved" : "🔖";
      btnBookmark.style.borderColor = saved ? "#facc15" : "";
      btnBookmark.style.color = saved ? "#fde047" : "";
    }
  }

  // ==========================================
  // WORD & PHRASE SELECTION + INSPECTOR HUD
  // ==========================================

  async function inspectWordToken(tokenEl) {
    document
      .querySelectorAll(".qz-word-token.qz-active-token")
      .forEach((el) => el.classList.remove("qz-active-token"));
    document
      .querySelectorAll(".qz-word-token.qz-phrase-selected")
      .forEach((el) => el.classList.remove("qz-phrase-selected"));

    tokenEl.classList.add("qz-active-token");

    const rawWord = decodeURIComponent(tokenEl.getAttribute("data-qz-raw") || "");
    const lang =
      tokenEl.getAttribute("data-qz-lang") || window.quizzlerStorage.data.targetLang;
    const ctxTarget = decodeURIComponent(tokenEl.getAttribute("data-qz-ctx-target") || "");
    let ctxEn = decodeURIComponent(tokenEl.getAttribute("data-qz-ctx-en") || "");

    // Speak word immediately
    window.quizzlerSound.speak(rawWord, lang);
    window.quizzlerSound.playTone(540, 0.1, "sine", 0.08);

    // Immediate local dictionary render first for zero latency
    const syncMeta = window.quizzlerStorage.lookupWordSync(rawWord, lang);
    if (syncMeta) {
      syncMeta.contextTarget = ctxTarget;
      syncMeta.contextEn = ctxEn;
      if (syncMeta.isFallback) {
        syncMeta.en = "⏳ Looking up definition...";
      }
      state.activeInspectorWord = syncMeta;
      renderFloatingInspector();
    }

    // Then enrich with live fallback if needed (or fetch missing context translation)
    const fullMeta = await window.quizzlerStorage.lookupWordWithLiveFallback(
      rawWord,
      lang,
      ctxTarget,
      ctxEn
    );
    if (fullMeta) {
      state.activeInspectorWord = fullMeta;
      await window.quizzlerStorage.setSelectedWord(fullMeta);
      renderFloatingInspector();
      showToast(`📖 ${fullMeta.word} : ${fullMeta.en}`);
    }
  }

  async function inspectPhraseSelection(rawPhrase, contextTarget = "", contextEn = "") {
    if (!rawPhrase || !rawPhrase.trim()) return;
    const lang = window.quizzlerStorage.data.targetLang;

    window.quizzlerSound.speak(rawPhrase, lang);
    window.quizzlerSound.playTone(560, 0.12, "sine", 0.1);

    const phraseMeta = await window.quizzlerStorage.lookupPhraseWithLiveFallback(
      rawPhrase.trim(),
      lang,
      contextTarget,
      contextEn
    );
    if (phraseMeta) {
      state.activeInspectorWord = phraseMeta;
      await window.quizzlerStorage.setSelectedWord(phraseMeta);
      renderFloatingInspector();
      showToast(`🔗 « ${phraseMeta.word} » — ${phraseMeta.en}`);
    }
  }

  function renderFloatingInspector() {
    const inspector = document.getElementById("qz-floating-inspector");
    if (!inspector) return;

    const meta = state.activeInspectorWord;
    if (!meta) {
      inspector.classList.remove("qz-open");
      return;
    }

    inspector.classList.add("qz-open");
    const lang = meta.lang || window.quizzlerStorage.data.targetLang;

    const wordEl = document.getElementById("qz-insp-word");
    const phoneticEl = document.getElementById("qz-insp-phonetic");
    const romajiEl = document.getElementById("qz-insp-romaji");
    const posEl = document.getElementById("qz-insp-pos");
    const statusEl = document.getElementById("qz-insp-status");
    const enEl = document.getElementById("qz-insp-en");
    const customTag = document.getElementById("qz-insp-custom-tag");
    const btnResetDef = document.getElementById("qz-btn-reset-def");
    const ctxTargetEl = document.getElementById("qz-insp-ctx-target");
    const ctxEnEl = document.getElementById("qz-insp-ctx-en");
    const extraBox = document.getElementById("qz-insp-extra-box");
    const btnToggleVault = document.getElementById("qz-btn-toggle-vault");

    if (wordEl) wordEl.textContent = meta.word;

    if (lang === "ja") {
      if (phoneticEl) phoneticEl.textContent = meta.kana ? `【 ${meta.kana} 】` : "";
      if (romajiEl) {
        romajiEl.style.display = meta.romaji ? "block" : "none";
        romajiEl.textContent = meta.romaji || "";
      }
      if (posEl) {
        posEl.textContent = `${meta.pos || "語句"}${meta.jlpt ? ` • JLPT ${meta.jlpt}` : ""}`;
      }
    } else {
      if (phoneticEl) phoneticEl.textContent = meta.ipa || "";
      if (romajiEl) romajiEl.style.display = "none";
      if (posEl) {
        let label = meta.pos || "word";
        if (meta.gender) label += ` (${meta.gender === "m" ? "Masc." : "Fem."})`;
        posEl.textContent = label;
      }
    }

    if (enEl) enEl.textContent = meta.en || "";
    if (customTag) customTag.style.display = meta.isCustom ? "inline" : "none";
    if (btnResetDef) btnResetDef.style.display = meta.isCustom ? "inline-flex" : "none";

    const ctxTarget = meta.contextTarget || meta.contextFr || meta.contextJa || "";
    const ctxEn = meta.contextEn || "";
    if (ctxTargetEl) {
      ctxTargetEl.textContent = ctxTarget ? `« ${ctxTarget} »` : "Selected on webpage";
    }
    if (ctxEnEl) {
      const hideRef = window.quizzlerStorage.data.immersionMode;
      ctxEnEl.textContent = ctxEn
        ? hideRef
          ? "👁️ (Click to reveal context translation)"
          : `"${ctxEn}"`
        : "";
      ctxEnEl.style.cursor = hideRef && ctxEn ? "pointer" : "default";
      ctxEnEl.onclick = () => {
        if (ctxEn) ctxEnEl.textContent = `"${ctxEn}"`;
      };
    }

    // Extra Box: Kanji Constituent Breakdown (Japanese) OR Detected Idioms (French)
    if (extraBox) {
      if (lang === "ja" && Array.isArray(meta.kanji) && meta.kanji.length > 0) {
        extraBox.style.display = "block";
        extraBox.innerHTML = `
          <span class="qz-label-mono" style="color:#facc15;">漢字 Kanji Breakdown (${meta.kanji.length})</span>
          ${meta.kanji
            .map(
              (k) => `
            <div class="qz-kanji-chip" data-kanji="${encodeURIComponent(k.char)}">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;font-weight:900;color:#facc15;">${escapeHtml(
                  k.char
                )}</span>
                <div>
                  <div style="font-size:12px;font-weight:700;color:#fff;">${escapeHtml(
                    k.meaning || ""
                  )}</div>
                  <div style="font-size:10.5px;font-family:monospace;color:#a1a1aa;">
                    On: ${escapeHtml(k.on || "-")} • Kun: ${escapeHtml(k.kun || "-")}
                  </div>
                </div>
              </div>
              <span style="font-size:12px;color:#facc15;">🔊</span>
            </div>
          `
            )
            .join("")}
        `;
        extraBox.querySelectorAll(".qz-kanji-chip").forEach((chip) => {
          chip.addEventListener("click", () => {
            const ch = decodeURIComponent(chip.getAttribute("data-kanji") || "");
            window.quizzlerSound.speak(ch, "ja");
          });
        });
      } else if (
        lang === "fr" &&
        !meta.isPhrase &&
        ctxTarget &&
        window.detectPhrasesInSentence
      ) {
        const detected = window.detectPhrasesInSentence(ctxTarget, meta.word);
        if (detected && detected.length > 0) {
          extraBox.style.display = "block";
          extraBox.innerHTML = `
            <span class="qz-label-mono" style="color:#facc15;">🔗 Idiom / Expression Detected</span>
            ${detected
              .map(
                (p) => `
              <div class="qz-kanji-chip" data-phrase="${encodeURIComponent(
                p.word || p.phrase
              )}">
                <div>
                  <div style="font-size:12px;font-weight:700;color:#fff;">« ${escapeHtml(
                    p.word || p.phrase
                  )} »</div>
                  <div style="font-size:11px;color:#fde047;">${escapeHtml(p.en)}</div>
                </div>
                <span style="font-size:11px;color:#facc15;font-weight:700;">Inspect →</span>
              </div>
            `
              )
              .join("")}
          `;
          extraBox.querySelectorAll(".qz-kanji-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
              const ph = decodeURIComponent(chip.getAttribute("data-phrase") || "");
              inspectPhraseSelection(ph, ctxTarget, ctxEn);
            });
          });
        } else {
          extraBox.style.display = "none";
        }
      } else {
        extraBox.style.display = "none";
      }
    }

    // Vault status
    const inVault = window.quizzlerStorage.isWordInReview(
      meta.cleanWord || meta.word,
      lang
    );
    const cardData = window.quizzlerStorage.getReviewWord(
      meta.cleanWord || meta.word,
      lang
    );

    if (statusEl) {
      if (cardData) {
        statusEl.textContent = `Level ${cardData.boxLevel || 1} • Reps: ${
          cardData.repetitions || 0
        }`;
        statusEl.style.color = "#facc15";
      } else {
        statusEl.textContent = "Not in flashcards yet";
        statusEl.style.color = "#a1a1aa";
      }
    }

    if (btnToggleVault) {
      if (inVault) {
        btnToggleVault.className = "qz-dock-btn";
        btnToggleVault.style.borderColor = "#10b981";
        btnToggleVault.style.color = "#6ee7b7";
        btnToggleVault.textContent = "✓ In Flashcards Deck (Click to Remove)";
      } else {
        btnToggleVault.className = "qz-dock-btn qz-primary";
        btnToggleVault.style.borderColor = "";
        btnToggleVault.style.color = "";
        btnToggleVault.textContent = "⭐ + Add to Flashcards Deck";
      }
    }
  }

  // ==========================================
  // ON-PAGE 3D FLASHCARDS TRAINER
  // ==========================================

  function openOnPageFlashcards(filter = "all") {
    state.flashcardFilter = filter;
    const lang = window.quizzlerStorage.data.targetLang;
    state.flashcardDeck = window.quizzlerStorage.getReviewCardsArray(filter, lang);
    state.flashcardIndex = 0;
    state.flashcardFlipped = false;
    state.flashcardModalOpen = true;

    const modal = document.getElementById("qz-modal-flashcards");
    if (modal) modal.classList.add("qz-open");

    renderOnPageFlashcard();
  }

  function closeOnPageFlashcards() {
    state.flashcardModalOpen = false;
    const modal = document.getElementById("qz-modal-flashcards");
    if (modal) modal.classList.remove("qz-open");
  }

  function flipOnPageFlashcard() {
    if (state.flashcardDeck.length === 0) return;
    state.flashcardFlipped = !state.flashcardFlipped;
    window.quizzlerSound.playCardFlip();
    const flipper = document.getElementById("qz-card-flipper");
    if (flipper) {
      flipper.classList.toggle("qz-flipped", state.flashcardFlipped);
    }
  }

  async function rateOnPageFlashcard(rating) {
    if (state.flashcardDeck.length === 0) return;
    const card = state.flashcardDeck[state.flashcardIndex];
    if (!card) return;

    const lang = card.lang || window.quizzlerStorage.data.targetLang;
    await window.quizzlerStorage.updateCardRating(card.cleanWord || card.word, rating, lang);

    if (rating === 3) {
      window.quizzlerSound.playCorrectChime();
    } else if (rating === 2) {
      window.quizzlerSound.playTone(540, 0.14, "triangle", 0.14);
    } else {
      window.quizzlerSound.playErrorTone();
      state.flashcardDeck.push(card);
    }

    if (state.flashcardIndex < state.flashcardDeck.length - 1) {
      state.flashcardIndex++;
    } else {
      state.flashcardIndex = 0;
      window.quizzlerSound.playMasteryFanfare();
      showToast("🎉 Deck cycle complete! Starting next round.");
    }
    state.flashcardFlipped = false;
    renderOnPageFlashcard();
  }

  function renderOnPageFlashcard() {
    const flipper = document.getElementById("qz-card-flipper");
    if (flipper) flipper.classList.remove("qz-flipped");
    state.flashcardFlipped = false;

    const progressEl = document.getElementById("qz-card-progress");
    const card = state.flashcardDeck[state.flashcardIndex];

    if (!card) {
      if (progressEl) progressEl.textContent = "0 / 0";
      const frontWord = document.getElementById("qz-card-front-word");
      const frontPhonetic = document.getElementById("qz-card-front-phonetic");
      const frontPos = document.getElementById("qz-card-front-pos");
      const frontCtx = document.getElementById("qz-card-front-ctx");
      if (frontWord) frontWord.textContent = "No Cards in Filter";
      if (frontPhonetic) frontPhonetic.textContent = "";
      if (frontPos) frontPos.textContent = "Empty";
      if (frontCtx) {
        frontCtx.textContent =
          "Click any word on the webpage and click '+ Add to Flashcards Deck'!";
      }
      return;
    }

    if (progressEl) {
      progressEl.textContent = `${state.flashcardIndex + 1} / ${state.flashcardDeck.length}`;
    }

    const levelEl = document.getElementById("qz-card-level");
    if (levelEl) {
      const lvl = card.boxLevel || 1;
      levelEl.textContent =
        lvl >= 3
          ? "Level 3 • Mastered"
          : lvl === 2
          ? "Level 2 • In Review"
          : "Level 1 • Learning";
    }

    const frontWord = document.getElementById("qz-card-front-word");
    const frontPhonetic = document.getElementById("qz-card-front-phonetic");
    const frontPos = document.getElementById("qz-card-front-pos");
    const frontCtx = document.getElementById("qz-card-front-ctx");

    if (frontWord) frontWord.textContent = card.word;
    if (frontPhonetic) {
      frontPhonetic.textContent =
        card.lang === "ja"
          ? `${card.kana || ""}${card.romaji ? ` (${card.romaji})` : ""}`
          : card.ipa || "";
    }
    if (frontPos) {
      frontPos.textContent = `${card.pos || "word"}${
        card.jlpt ? ` • ${card.jlpt}` : ""
      }`;
    }
    const ctxTarget = card.exampleTarget || card.exampleFr || card.exampleJa || "";
    if (frontCtx) {
      frontCtx.textContent = ctxTarget ? `« ${ctxTarget} »` : `« ${card.word} »`;
    }

    const backWord = document.getElementById("qz-card-back-word");
    const backEn = document.getElementById("qz-card-back-en");
    const backSub = document.getElementById("qz-card-back-sub");
    const backCtxTarget = document.getElementById("qz-card-back-ctx-target");
    const backCtxEn = document.getElementById("qz-card-back-ctx-en");

    if (backWord) backWord.textContent = card.word;
    if (backEn) backEn.textContent = card.en;
    if (backSub) {
      backSub.textContent =
        card.lang === "ja" ? `${card.kana || ""} ${card.romaji || ""}` : card.ipa || "";
    }
    if (backCtxTarget) backCtxTarget.textContent = ctxTarget ? `« ${ctxTarget} »` : "";
    if (backCtxEn) backCtxEn.textContent = card.exampleEn ? `"${card.exampleEn}"` : "";

    window.quizzlerSound.speak(card.word, card.lang || window.quizzlerStorage.data.targetLang);
  }

  // ==========================================
  // EVENT LISTENERS & MESSAGE PASSING
  // ==========================================

  function bindGlobalEvents() {
    // Delegate clicks on tokenized words and paragraph action buttons
    document.addEventListener("click", (e) => {
      const tokenEl = e.target.closest?.(".qz-word-token");
      if (tokenEl) {
        e.stopPropagation();
        inspectWordToken(tokenEl);
        return;
      }

      const speakBtn = e.target.closest?.(".qz-btn-speak-para");
      if (speakBtn) {
        e.stopPropagation();
        const blockEl = speakBtn.closest("[data-qz-target-text]");
        const text = blockEl?.getAttribute("data-qz-target-text") || "";
        if (text) {
          window.quizzlerSound.speak(text, window.quizzlerStorage.data.targetLang);
        }
        return;
      }

      const compareBtn = e.target.closest?.(".qz-btn-compare-para");
      if (compareBtn) {
        e.stopPropagation();
        const blockIdx = Number(compareBtn.getAttribute("data-qz-block"));
        const blockEl = compareBtn.closest("[data-qz-block-id]");
        if (blockEl) {
          toggleParagraphComparator(blockEl, blockIdx);
        }
        return;
      }
      // Hide selection pill when clicking outside it
      if (!e.target.closest?.("#qz-selection-pill")) {
        const pill = document.getElementById("qz-selection-pill");
        if (pill) pill.classList.remove("qz-pill-visible");
      }
    });

    // Multi-word phrase & block highlight selection
    document.addEventListener("mouseup", (e) => {
      if (e.target.closest?.(".qz-ui-root") || e.target.closest?.(".qz-trans-drawer")) {
        return;
      }
      const pill = document.getElementById("qz-selection-pill");
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        if (pill) pill.classList.remove("qz-pill-visible");
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3) {
        if (pill) pill.classList.remove("qz-pill-visible");
        return;
      }

      const anchorEl =
        sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
      const blockEl =
        anchorEl?.closest?.("[data-qz-block-id]") ||
        anchorEl?.closest?.("p, blockquote, li, h1, h2, h3, h4");

      state.pendingSelectionText = text;
      state.pendingSelectionBlockEl = blockEl || null;

      // Show floating Selection Action Pill ("✍️ Translate Block" + "📖 Inspect") near selection
      if (pill && (text.length >= 12 || text.includes(" "))) {
        try {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const top = Math.max(12, rect.top - 42);
            const left = Math.min(
              window.innerWidth - 230,
              Math.max(12, rect.left + rect.width / 2 - 95)
            );
            pill.style.top = `${top}px`;
            pill.style.left = `${left}px`;
            pill.classList.add("qz-pill-visible");
          }
        } catch (err) {}
      }

      // If short multi-word idiom/phrase inside an immersed block, also auto-inspect in HUD
      if (text.length >= 2 && text.length <= 48 && text.includes(" ") && blockEl?.hasAttribute("data-qz-target-text")) {
        const ctxTarget = blockEl.getAttribute("data-qz-target-text") || "";
        const ctxEn = blockEl.getAttribute("data-qz-ref-en") || "";
        inspectPhraseSelection(text, ctxTarget, ctxEn);
      }
    });

    // Selection Pill Actions
    document.getElementById("qz-sel-btn-translate")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const pill = document.getElementById("qz-selection-pill");
      if (pill) pill.classList.remove("qz-pill-visible");

      const blockEl = state.pendingSelectionBlockEl;
      if (blockEl) {
        const existingIdx = blockEl.hasAttribute("data-qz-block-id")
          ? Number(blockEl.getAttribute("data-qz-block-id"))
          : undefined;
        await toggleParagraphComparator(blockEl, existingIdx, {
          forceOpen: true,
          focusInput: true
        });
      }
    });

    document.getElementById("qz-sel-btn-inspect")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const pill = document.getElementById("qz-selection-pill");
      if (pill) pill.classList.remove("qz-pill-visible");

      const text = state.pendingSelectionText;
      if (!text) return;
      const blockEl = state.pendingSelectionBlockEl;
      const ctxTarget = blockEl?.getAttribute?.("data-qz-target-text") || (blockEl?.innerText || "").trim();
      const ctxEn = blockEl?.getAttribute?.("data-qz-ref-en") || "";
      await inspectPhraseSelection(text, ctxTarget, ctxEn);
    });

    // Translator Mode Sticky Banner Controls
    document
      .getElementById("qz-banner-btn-next")
      ?.addEventListener("click", () => jumpToNextUntranslatedBlock());
    document
      .getElementById("qz-banner-btn-expand")
      ?.addEventListener("click", () => expandAllBlockWorkbenches());
    document
      .getElementById("qz-banner-btn-collapse")
      ?.addEventListener("click", () => collapseAllBlockWorkbenches());
    document
      .getElementById("qz-banner-btn-export")
      ?.addEventListener("click", () => exportBilingualManuscript());
    document
      .getElementById("qz-banner-btn-close")
      ?.addEventListener("click", () => toggleTranslatorMode(false));

    // Floating Dock Controls
    document.getElementById("qz-dock-lang")?.addEventListener("change", async (e) => {
      const newLang = e.target.value;
      await window.quizzlerStorage.setTargetLang(newLang);
      const cfg = window.quizzlerStorage.getLangConfig(newLang);
      updateDockButtons();
      showToast(`${cfg.flag} Switched target language to ${cfg.nativeName}`);
    });

    document
      .getElementById("qz-dock-btn-immerse")
      ?.addEventListener("click", () => smartImmersePage());

    document
      .getElementById("qz-dock-btn-translator")
      ?.addEventListener("click", () => toggleTranslatorMode());

    document
      .getElementById("qz-dock-btn-restore")
      ?.addEventListener("click", () => restoreOriginalPage());

    document
      .getElementById("qz-dock-btn-bookmark")
      ?.addEventListener("click", async () => {
        const res = await window.quizzlerStorage.toggleBookmark({
          url: window.location.href,
          title: document.title || window.location.hostname,
          lang: window.quizzlerStorage.data.targetLang
        });
        updateDockButtons();
        if (res.added) {
          window.quizzlerSound.playCorrectChime();
          showToast("🔖 Bookmarked this page for language learning!");
        } else {
          showToast("Removed page from learning bookmarks.");
        }
      });

    document
      .getElementById("qz-dock-btn-hide")
      ?.addEventListener("click", async () => {
        await window.quizzlerStorage.setOverlayEnabledForPage(window.location.href, false);
        syncOverlayBarVisibility();
        showToast("Overlay bar hidden on this site. Enable anytime from the Side Panel.");
      });

    document
      .getElementById("qz-dock-btn-furigana")
      ?.addEventListener("click", async () => {
        const order = ["always", "hover", "off"];
        const curr = window.quizzlerStorage.data.furiganaMode || "always";
        const next = order[(order.indexOf(curr) + 1) % order.length];
        await window.quizzlerStorage.setFuriganaMode(next);
        showToast(`Furigana display: ${next.toUpperCase()}`);
      });

    document
      .getElementById("qz-dock-btn-cards")
      ?.addEventListener("click", () => openOnPageFlashcards("all"));

    document
      .getElementById("qz-dock-btn-sidepanel")
      ?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
      });

    // Floating Inspector Controls
    document.getElementById("qz-insp-close")?.addEventListener("click", () => {
      state.activeInspectorWord = null;
      renderFloatingInspector();
    });

    document.getElementById("qz-insp-audio")?.addEventListener("click", () => {
      if (state.activeInspectorWord) {
        window.quizzlerSound.speak(
          state.activeInspectorWord.word,
          state.activeInspectorWord.lang || window.quizzlerStorage.data.targetLang
        );
      }
    });

    document.getElementById("qz-btn-toggle-vault")?.addEventListener("click", async () => {
      if (!state.activeInspectorWord) return;
      const added = await window.quizzlerStorage.toggleWordInReview(
        state.activeInspectorWord
      );
      if (added) {
        window.quizzlerSound.playCorrectChime();
        showToast(`⭐ Added "${state.activeInspectorWord.word}" to Flashcards!`);
      } else {
        window.quizzlerSound.playTone(280, 0.15, "sawtooth", 0.1);
        showToast(`Removed "${state.activeInspectorWord.word}" from Flashcards.`);
      }
      renderFloatingInspector();
      refreshTokenHighlightsOnPage();
      updateDockCounters();
    });

    document.getElementById("qz-btn-edit-def")?.addEventListener("click", () => {
      const form = document.getElementById("qz-insp-edit-form");
      const input = document.getElementById("qz-insp-edit-input");
      if (form && input && state.activeInspectorWord) {
        form.style.display = "block";
        input.value = state.activeInspectorWord.en || "";
        input.focus();
      }
    });

    document.getElementById("qz-btn-cancel-def")?.addEventListener("click", () => {
      const form = document.getElementById("qz-insp-edit-form");
      if (form) form.style.display = "none";
    });

    document.getElementById("qz-btn-save-def")?.addEventListener("click", async () => {
      const input = document.getElementById("qz-insp-edit-input");
      const form = document.getElementById("qz-insp-edit-form");
      if (!input || !state.activeInspectorWord) return;
      const val = input.value.trim();
      if (!val) return;
      await window.quizzlerStorage.setCustomDefinition(
        state.activeInspectorWord.cleanWord || state.activeInspectorWord.word,
        val,
        state.activeInspectorWord.lang
      );
      state.activeInspectorWord.en = val;
      state.activeInspectorWord.isCustom = true;
      if (form) form.style.display = "none";
      window.quizzlerSound.playCorrectChime();
      renderFloatingInspector();
      showToast("Saved custom definition!");
    });

    document.getElementById("qz-btn-reset-def")?.addEventListener("click", async () => {
      if (!state.activeInspectorWord) return;
      await window.quizzlerStorage.resetCustomDefinition(
        state.activeInspectorWord.cleanWord || state.activeInspectorWord.word,
        state.activeInspectorWord.originalEn || "",
        state.activeInspectorWord.lang
      );
      renderFloatingInspector();
      showToast("Restored default dictionary definition.");
    });

    document
      .getElementById("qz-btn-open-cards-from-insp")
      ?.addEventListener("click", () => openOnPageFlashcards("all"));

    document
      .getElementById("qz-btn-open-sidepanel-from-insp")
      ?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
      });

    // On-Page 3D Flashcards Modal Controls
    document
      .getElementById("qz-modal-close")
      ?.addEventListener("click", () => closeOnPageFlashcards());

    document
      .getElementById("qz-card-flipper")
      ?.addEventListener("click", () => flipOnPageFlashcard());

    document.getElementById("qz-card-audio")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = state.flashcardDeck[state.flashcardIndex];
      if (card) {
        window.quizzlerSound.speak(
          card.word,
          card.lang || window.quizzlerStorage.data.targetLang
        );
      }
    });

    document
      .getElementById("qz-rate-1")
      ?.addEventListener("click", () => rateOnPageFlashcard(1));
    document
      .getElementById("qz-rate-2")
      ?.addEventListener("click", () => rateOnPageFlashcard(2));
    document
      .getElementById("qz-rate-3")
      ?.addEventListener("click", () => rateOnPageFlashcard(3));

    document.getElementById("qz-card-prev")?.addEventListener("click", () => {
      if (state.flashcardDeck.length === 0) return;
      state.flashcardIndex =
        (state.flashcardIndex - 1 + state.flashcardDeck.length) %
        state.flashcardDeck.length;
      renderOnPageFlashcard();
    });

    document.getElementById("qz-card-next")?.addEventListener("click", () => {
      if (state.flashcardDeck.length === 0) return;
      state.flashcardIndex = (state.flashcardIndex + 1) % state.flashcardDeck.length;
      renderOnPageFlashcard();
    });

    document.getElementById("qz-card-shuffle")?.addEventListener("click", () => {
      for (let i = state.flashcardDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.flashcardDeck[i], state.flashcardDeck[j]] = [
          state.flashcardDeck[j],
          state.flashcardDeck[i]
        ];
      }
      state.flashcardIndex = 0;
      renderOnPageFlashcard();
      showToast("🔀 Shuffled flashcard deck!");
    });

    document.querySelectorAll(".qz-card-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-filter") || "all";
        openOnPageFlashcards(filter);
      });
    });

    // Keyboard shortcuts when On-Page 3D Flashcards Modal is open
    window.addEventListener("keydown", (e) => {
      if (!state.flashcardModalOpen) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        flipOnPageFlashcard();
      } else if (e.key === "1") {
        e.preventDefault();
        rateOnPageFlashcard(1);
      } else if (e.key === "2") {
        e.preventDefault();
        rateOnPageFlashcard(2);
      } else if (e.key === "3") {
        e.preventDefault();
        rateOnPageFlashcard(3);
      } else if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        const card = state.flashcardDeck[state.flashcardIndex];
        if (card) {
          window.quizzlerSound.speak(
            card.word,
            card.lang || window.quizzlerStorage.data.targetLang
          );
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        document.getElementById("qz-card-prev")?.click();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        document.getElementById("qz-card-next")?.click();
      } else if (e.key === "Escape") {
        closeOnPageFlashcards();
      }
    });

    // Listen for messages from Side Panel or Service Worker
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        if (message.type === "TRIGGER_SMART_IMMERSE_PAGE") {
          await smartImmersePage();
          sendResponse({
            ok: true,
            mode: state.mode,
            detectedPageLang: state.detectedPageLang
          });
        } else if (message.type === "TRIGGER_TRANSLATE_PAGE") {
          await translateAndTokenizePage();
          sendResponse({ ok: true, mode: state.mode });
        } else if (message.type === "TRIGGER_TOKENIZE_NATIVE_PAGE") {
          await tokenizeNativePage();
          sendResponse({ ok: true, mode: state.mode });
        } else if (message.type === "TRIGGER_RESTORE_PAGE") {
          restoreOriginalPage();
          sendResponse({ ok: true, mode: null });
        } else if (message.type === "TOGGLE_TRANSLATOR_MODE") {
          const nextMode = await toggleTranslatorMode(message.forceState);
          const blocks = getTranslatableBlocksOnPage();
          const pageKey = window.quizzlerStorage.getPageKey();
          const stats = window.quizzlerStorage.getPageTranslationStats(
            pageKey,
            blocks.length
          );
          sendResponse({
            ok: true,
            translatorMode: nextMode,
            isPageTransformed: state.isPageTransformed,
            stats
          });
        } else if (message.type === "GET_PAGE_BLOCKS") {
          const pageKey = window.quizzlerStorage.getPageKey();
          const candidateEls = getTranslatableBlocksOnPage().slice(0, 80);
          const blocksData = candidateEls.map((el, idx) => {
            const blockIndex = el.hasAttribute("data-qz-block-id")
              ? Number(el.getAttribute("data-qz-block-id"))
              : idx;
            const saved = window.quizzlerStorage.getPageBlockData(pageKey, blockIndex);
            const sourceText = (
              el.getAttribute("data-qz-target-text") ||
              saved.sourceText ||
              el.innerText ||
              ""
            ).trim();
            const referenceText = (
              el.getAttribute("data-qz-ref-en") ||
              saved.referenceText ||
              ""
            ).trim();
            return {
              blockIndex,
              sourceText,
              referenceText,
              userText: saved.text || "",
              score: saved.score
            };
          });
          const stats = window.quizzlerStorage.getPageTranslationStats(
            pageKey,
            blocksData.length
          );
          sendResponse({
            ok: true,
            pageKey,
            url: window.location.href,
            title: document.title || window.location.hostname,
            isPageTransformed: state.isPageTransformed,
            translatorMode: state.translatorMode,
            blocks: blocksData,
            stats
          });
        } else if (message.type === "SCROLL_TO_BLOCK") {
          const blockIndex = Number(message.blockIndex);
          const candidateEls = getTranslatableBlocksOnPage();
          const targetEl =
            document.querySelector(`[data-qz-block-id="${blockIndex}"]`) ||
            candidateEls[blockIndex];
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            if (message.openWorkbench) {
              await toggleParagraphComparator(targetEl, blockIndex, {
                forceOpen: true,
                focusInput: true
              });
            } else {
              targetEl.classList.add("qz-block-active-highlight");
              setTimeout(
                () => targetEl.classList.remove("qz-block-active-highlight"),
                1800
              );
            }
          }
          sendResponse({ ok: true });
        } else if (message.type === "EXPORT_PAGE_MANUSCRIPT") {
          const res = await exportBilingualManuscript();
          sendResponse(res);
        } else if (message.type === "TOGGLE_FLOATING_BAR") {
          const nextState = await window.quizzlerStorage.toggleOverlayForPage(
            window.location.href
          );
          syncOverlayBarVisibility();
          showToast(
            nextState
              ? "🧭 Quizzler overlay bar enabled for this page."
              : "Overlay bar hidden for this page."
          );
          sendResponse({ ok: true, overlayEnabled: nextState });
        } else if (message.type === "SET_FLOATING_BAR") {
          const enabled = Boolean(message.enabled);
          await window.quizzlerStorage.setOverlayEnabledForPage(
            window.location.href,
            enabled
          );
          syncOverlayBarVisibility();
          sendResponse({ ok: true, overlayEnabled: enabled });
        } else if (message.type === "BOOKMARK_CURRENT_PAGE") {
          const res = await window.quizzlerStorage.toggleBookmark({
            url: window.location.href,
            title: document.title || window.location.hostname,
            lang: window.quizzlerStorage.data.targetLang
          });
          updateDockButtons();
          showToast(
            res.added
              ? "🔖 Bookmarked this page for language learning!"
              : "Removed page from learning bookmarks."
          );
          sendResponse({ ok: true, isBookmarked: res.added });
        } else if (message.type === "INSPECT_TEXT_SELECTION") {
          const text = (message.text || "").trim();
          if (text.includes(" ")) {
            await inspectPhraseSelection(text);
          } else {
            const fullMeta = await window.quizzlerStorage.lookupWordWithLiveFallback(
              text,
              window.quizzlerStorage.data.targetLang
            );
            if (fullMeta) {
              state.activeInspectorWord = fullMeta;
              await window.quizzlerStorage.setSelectedWord(fullMeta);
              window.quizzlerSound.speak(fullMeta.word, fullMeta.lang);
              renderFloatingInspector();
              showToast(`📖 Inspected "${fullMeta.word}"`);
            }
          }
          sendResponse({ ok: true });
        } else if (message.type === "GET_PAGE_STATUS") {
          const isNative = isPageAlreadyInTargetLang();
          const blocks = getTranslatableBlocksOnPage();
          const pageKey = window.quizzlerStorage.getPageKey();
          const translationStats = window.quizzlerStorage.getPageTranslationStats(
            pageKey,
            blocks.length
          );
          sendResponse({
            ok: true,
            isPageTransformed: state.isPageTransformed,
            translatorMode: state.translatorMode,
            mode: state.mode,
            detectedPageLang: state.detectedPageLang,
            isNativeTargetLang: isNative,
            overlayEnabled: window.quizzlerStorage.isOverlayEnabledForPage(
              window.location.href
            ),
            isBookmarked: window.quizzlerStorage.isUrlBookmarked(window.location.href),
            translationStats,
            url: window.location.href,
            title: document.title
          });
        }
      })();
      return true;
    });
  }

  function showToast(msg) {
    const toast = document.getElementById("qz-toast");
    const msgEl = document.getElementById("qz-toast-msg");
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.classList.add("qz-visible");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.classList.remove("qz-visible");
    }, 3000);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  initContentScript();
})();
