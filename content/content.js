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
    activeInspectorWord: null,
    flashcardDeck: [],
    flashcardIndex: 0,
    flashcardFlipped: false,
    flashcardFilter: "all",
    flashcardModalOpen: false,
    revealedBlocks: new Set(),
    toastTimer: null
  };

  async function initContentScript() {
    await window.quizzlerStorage.init();
    applyDocumentLanguageClasses();
    injectFloatingUI();
    bindGlobalEvents();

    window.quizzlerStorage.subscribe(() => {
      applyDocumentLanguageClasses();
      refreshTokenHighlightsOnPage();
      updateDockCounters();
      if (state.activeInspectorWord && window.quizzlerStorage.data.selectedWord) {
        state.activeInspectorWord = window.quizzlerStorage.data.selectedWord;
        renderFloatingInspector();
      }
    });
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

    // Latin/European scripts (French, Spanish, German, Italian, etc.)
    const tokenRegex = /([a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ']+)|([^a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ']+)/g;
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
        )}" data-qz-block="${blockIndex}" data-qz-tok="${tokIdx}">${word}</span>`;
        tokIdx++;
      } else if (sep) {
        html += sep;
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
  // (Batched with requestAnimationFrame + scheduler.yield)
  // ==========================================

  function collectCandidateBlocks() {
    const selectors = "p, h1, h2, h3, h4, li, blockquote, figcaption";
    const all = Array.from(document.querySelectorAll(selectors));
    return all.filter((el) => {
      if (el.closest(".qz-ui-root") || el.closest(".qz-trans-drawer")) return false;
      if (el.closest("nav, footer, script, style, code, pre, svg, button, form")) return false;
      // Skip elements that contain nested block candidates to avoid breaking parent layout
      if (el.querySelector("p, h1, h2, h3, h4, ul, ol, table")) return false;

      const text = (el.innerText || "").trim();
      if (text.length < 8) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return true;
    });
  }

  async function translateAndTokenizePage() {
    if (state.isPageTransformed) {
      restoreOriginalPage();
    }

    const lang = window.quizzlerStorage.data.targetLang;
    const langCfg = window.quizzlerStorage.getLangConfig(lang);
    const blocks = collectCandidateBlocks().slice(0, 80); // Cap at 80 primary blocks for snappy UX

    if (blocks.length === 0) {
      showToast("No readable text blocks found on this page.");
      return;
    }

    showToast(`${langCfg.flag} Translating ${blocks.length} blocks into ${langCfg.nativeName}...`);
    const btnTranslate = document.getElementById("qz-dock-btn-translate");
    if (btnTranslate) {
      btnTranslate.textContent = "⏳ Translating...";
      btnTranslate.disabled = true;
    }

    try {
      const BATCH_SIZE = 10;
      for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batchEls = blocks.slice(i, i + BATCH_SIZE);
        const rawTexts = batchEls.map((el) => (el.innerText || "").trim());

        const resp = await chrome.runtime.sendMessage({
          type: "TRANSLATE_BATCH",
          texts: rawTexts,
          sourceLang: "auto",
          targetLang: lang
        });

        const translatedList = resp?.results || rawTexts.map((t) => ({ original: t, translated: t }));

        // Batch DOM updates inside requestAnimationFrame per MV3 Rule #6
        await new Promise((resolve) =>
          requestAnimationFrame(() => {
            batchEls.forEach((el, idx) => {
              const blockIndex = i + idx;
              const origText = rawTexts[idx];
              const targetText = translatedList[idx]?.translated || origText;
              const romajiText = translatedList[idx]?.romaji || "";

              applyBlockTransformation(el, targetText, origText, lang, blockIndex, romajiText);
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
        `${langCfg.flag} Page translated to ${langCfg.nativeName}! Click any word to inspect.`
      );
    } catch (err) {
      console.error("Translate page error:", err);
      showToast("⚠️ Translation error. Try Tokenize Native mode.");
    } finally {
      updateDockButtons();
    }
  }

  async function tokenizeNativePage() {
    if (state.isPageTransformed) {
      restoreOriginalPage();
    }

    const lang = window.quizzlerStorage.data.targetLang;
    const langCfg = window.quizzlerStorage.getLangConfig(lang);
    const blocks = collectCandidateBlocks().slice(0, 100);

    if (blocks.length === 0) {
      showToast("No readable text blocks found on this page.");
      return;
    }

    const BATCH_SIZE = 20;
    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batchEls = blocks.slice(i, i + BATCH_SIZE);
      await new Promise((resolve) =>
        requestAnimationFrame(() => {
          batchEls.forEach((el, idx) => {
            const blockIndex = i + idx;
            const nativeText = (el.innerText || "").trim();
            applyBlockTransformation(el, nativeText, "", lang, blockIndex, "");
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
      `${langCfg.flag} Tokenized ${blocks.length} blocks in ${langCfg.nativeName}! Click any word.`
    );
    updateDockButtons();
  }

  function applyBlockTransformation(
    el,
    targetText,
    referenceEnText,
    lang,
    blockIndex,
    romajiText = ""
  ) {
    if (!el.hasAttribute("data-qz-orig-html")) {
      el.setAttribute("data-qz-orig-html", el.innerHTML);
      el.setAttribute("data-qz-orig-text", el.innerText || "");
    }
    el.setAttribute("data-qz-block-id", String(blockIndex));
    el.setAttribute("data-qz-target-text", targetText);
    el.setAttribute("data-qz-ref-en", referenceEnText || "");

    const tokenizedHtml = tokenizeSentenceHtml(
      targetText,
      lang,
      targetText,
      referenceEnText,
      blockIndex
    );

    const romajiHtml =
      lang === "ja" && romajiText
        ? `<span class="qz-romaji-subline">${escapeHtml(romajiText)}</span>`
        : "";

    const actionsHtml = `
      <span class="qz-para-actions" contenteditable="false">
        <button type="button" class="qz-para-btn qz-btn-speak-para" data-qz-block="${blockIndex}" title="Listen to pronunciation">
          🔊
        </button>
        <button type="button" class="qz-para-btn qz-btn-compare-para" data-qz-block="${blockIndex}" title="Translate & Compare with Reference (0-4★)">
          ✍️ Compare
        </button>
      </span>
    `;

    el.innerHTML = `${tokenizedHtml}${actionsHtml}${romajiHtml}`;
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
    });

    document.querySelectorAll(".qz-trans-drawer").forEach((d) => d.remove());
    state.isPageTransformed = false;
    state.mode = null;
    updateDockButtons();
    showToast("Restored original webpage.");
  }

  // ==========================================
  // IN-PAGE SENTENCE COMPARATOR & 0-4★ WORKSPACE
  // ==========================================

  async function toggleParagraphComparator(blockEl, blockIndex) {
    const existingId = `qz-drawer-${blockIndex}`;
    const existing = document.getElementById(existingId);
    if (existing) {
      existing.remove();
      return;
    }

    const lang = window.quizzlerStorage.data.targetLang;
    const pageKey = window.quizzlerStorage.getPageKey();
    const savedBlock = window.quizzlerStorage.getPageBlockData(pageKey, blockIndex);
    const targetText = blockEl.getAttribute("data-qz-target-text") || "";
    let refEn = blockEl.getAttribute("data-qz-ref-en") || "";

    // If in native mode and reference English translation isn't fetched yet, fetch it on demand
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
    const isRevealed = !immersionMode || state.revealedBlocks.has(blockIndex);

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

    drawer.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span class="qz-label-mono" style="color:#facc15;">✍️ Quizzler Active Translation & Self-Assessment</span>
        <button type="button" class="qz-para-btn qz-drawer-close" style="padding:1px 7px;">✕</button>
      </div>
      <textarea class="qz-trans-input" placeholder="Type your English translation of this sentence before revealing the reference...">${escapeHtml(
        savedBlock.text || ""
      )}</textarea>
      <div class="qz-drawer-row">
        <button type="button" class="qz-para-btn qz-btn-reveal-ref">
          ${isRevealed ? "🙈 Hide Reference Translation" : "👁️ Reveal Reference Translation"}
        </button>
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
        <span class="qz-label-mono" style="color:#34d399;margin-bottom:2px;">Reference English Translation</span>
        <div class="qz-ref-text">${escapeHtml(refEn || "Reference translation unavailable.")}</div>
      </div>
    `;

    blockEl.insertAdjacentElement("afterend", drawer);

    const textarea = drawer.querySelector(".qz-trans-input");
    textarea.addEventListener("input", () => {
      window.quizzlerStorage.savePageBlockTranslation(pageKey, blockIndex, textarea.value);
    });

    const btnClose = drawer.querySelector(".qz-drawer-close");
    btnClose.addEventListener("click", () => drawer.remove());

    const btnReveal = drawer.querySelector(".qz-btn-reveal-ref");
    const refBox = drawer.querySelector(".qz-ref-box");
    btnReveal.addEventListener("click", () => {
      if (state.revealedBlocks.has(blockIndex)) {
        state.revealedBlocks.delete(blockIndex);
        refBox.style.display = "none";
        btnReveal.textContent = "👁️ Reveal Reference Translation";
      } else {
        state.revealedBlocks.add(blockIndex);
        refBox.style.display = "block";
        btnReveal.textContent = "🙈 Hide Reference Translation";
        window.quizzlerSound.playHintChime();
      }
    });

    drawer.querySelectorAll(".qz-star-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const score = Number(btn.getAttribute("data-score"));
        await window.quizzlerStorage.savePageBlockScore(pageKey, blockIndex, score);
        drawer.querySelectorAll(".qz-star-btn").forEach((b) => b.classList.remove("qz-active"));
        btn.classList.add("qz-active");
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

      <!-- Bottom-Right Floating Quizzler Control Dock -->
      <div id="qz-floating-dock">
        <select id="qz-dock-lang" class="qz-dock-select" title="Select Target Learning Language">
          <option value="fr">🇫🇷 FR</option>
          <option value="ja">🇯🇵 JA</option>
          <option value="es">🇪🇸 ES</option>
          <option value="de">🇩🇪 DE</option>
          <option value="it">🇮🇹 IT</option>
        </select>

        <button type="button" id="qz-dock-btn-translate" class="qz-dock-btn qz-primary" title="Translate webpage into target language & make every word clickable">
          🌐 Translate & Immerse
        </button>

        <button type="button" id="qz-dock-btn-tokenize" class="qz-dock-btn" title="Already on a target-language site? Make every word clickable!">
          🔍 Tokenize Native
        </button>

        <button type="button" id="qz-dock-btn-restore" class="qz-dock-btn" style="display:none;" title="Restore original webpage">
          🔄 Restore
        </button>

        <button type="button" id="qz-dock-btn-furigana" class="qz-dock-btn" style="display:none;" title="Cycle Japanese Furigana display (Always / Hover / Off)">
          あ Furigana: Always
        </button>

        <button type="button" id="qz-dock-btn-cards" class="qz-dock-btn" title="Practice 3D Flashcards on this page">
          🗂️ <span id="qz-dock-card-count">5</span>
        </button>

        <button type="button" id="qz-dock-btn-sidepanel" class="qz-dock-btn" title="Open Quizzler Side Panel">
          📐 Panel
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
    const btnTranslate = document.getElementById("qz-dock-btn-translate");
    const btnRestore = document.getElementById("qz-dock-btn-restore");
    if (btnTranslate) {
      btnTranslate.disabled = false;
      btnTranslate.textContent = "🌐 Translate & Immerse";
    }
    if (btnRestore) {
      btnRestore.style.display = state.isPageTransformed ? "inline-flex" : "none";
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
    });

    // Multi-word phrase highlight selection
    document.addEventListener("mouseup", (e) => {
      if (e.target.closest?.(".qz-ui-root") || e.target.closest?.(".qz-trans-drawer")) {
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length >= 2 && text.length <= 120 && text.includes(" ")) {
        const anchorEl =
          sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
        const blockEl = anchorEl?.closest?.("[data-qz-target-text]");
        if (blockEl) {
          const ctxTarget = blockEl.getAttribute("data-qz-target-text") || "";
          const ctxEn = blockEl.getAttribute("data-qz-ref-en") || "";
          inspectPhraseSelection(text, ctxTarget, ctxEn);
        }
      }
    });

    // Floating Dock Controls
    document.getElementById("qz-dock-lang")?.addEventListener("change", async (e) => {
      const newLang = e.target.value;
      await window.quizzlerStorage.setTargetLang(newLang);
      const cfg = window.quizzlerStorage.getLangConfig(newLang);
      showToast(`${cfg.flag} Switched target language to ${cfg.nativeName}`);
    });

    document
      .getElementById("qz-dock-btn-translate")
      ?.addEventListener("click", () => translateAndTokenizePage());

    document
      .getElementById("qz-dock-btn-tokenize")
      ?.addEventListener("click", () => tokenizeNativePage());

    document
      .getElementById("qz-dock-btn-restore")
      ?.addEventListener("click", () => restoreOriginalPage());

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
        if (message.type === "TRIGGER_TRANSLATE_PAGE") {
          await translateAndTokenizePage();
          sendResponse({ ok: true, mode: state.mode });
        } else if (message.type === "TRIGGER_TOKENIZE_NATIVE_PAGE") {
          await tokenizeNativePage();
          sendResponse({ ok: true, mode: state.mode });
        } else if (message.type === "TRIGGER_RESTORE_PAGE") {
          restoreOriginalPage();
          sendResponse({ ok: true, mode: null });
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
          sendResponse({
            ok: true,
            isPageTransformed: state.isPageTransformed,
            mode: state.mode,
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
