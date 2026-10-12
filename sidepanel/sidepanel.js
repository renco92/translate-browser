/**
 * Quizzler Side Panel Controller
 * Coordinates Webpage Immersion triggers, live-synced Word & Kanji Inspector,
 * 3D Tactile Index Cards Trainer, Review Vault management, and 50-Sounds Kana Chart.
 */

(function () {
  "use strict";

  const panelState = {
    activeTab: "inspector", // 'inspector' | 'translate' | 'flashcards' | 'sites' | 'vault'
    currentWord: null,
    deck: [],
    cardIndex: 0,
    isFlipped: false,
    cardFilter: "all",
    kanaTab: "hiragana",
    activeTabStatus: null,
    translateMode: "page", // 'page' | 'custom'
    pageBlocks: [],
    customBlocks: [],
    activeBlockCursor: 0,
    pageKey: "custom_workbench",
    revealedSideBlocks: new Set(),
    toastTimer: null
  };

  document.addEventListener("DOMContentLoaded", async () => {
    await window.quizzlerStorage.init();
    initDefaultWord();
    bindPanelEvents();
    await refreshActiveTabStatus();
    renderAll();

    window.quizzlerStorage.subscribe((data) => {
      if (data.selectedWord) {
        panelState.currentWord = data.selectedWord;
      }
      refreshActiveTabStatus();
      renderAll();
    });

    if (chrome.tabs?.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        refreshActiveTabStatus();
        if (panelState.activeTab === "translate" && panelState.translateMode === "page") {
          syncBlocksFromActivePage();
        }
      });
    }
    if (chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo.status === "complete" || changeInfo.url) {
          refreshActiveTabStatus();
          if (panelState.activeTab === "translate" && panelState.translateMode === "page") {
            syncBlocksFromActivePage();
          }
        }
      });
    }
  });

  async function refreshActiveTabStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || tab.url.startsWith("chrome")) {
        panelState.activeTabStatus = {
          url: tab?.url || "",
          title: tab?.title || "",
          overlayEnabled: false,
          isBookmarked: false,
          isNativeTargetLang: false,
          translatorMode: false
        };
        renderHeaderAndControls();
        return;
      }
      const resp = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_STATUS" });
      if (resp?.ok) {
        panelState.activeTabStatus = resp;
      } else {
        panelState.activeTabStatus = {
          url: tab.url,
          title: tab.title,
          overlayEnabled: window.quizzlerStorage.isOverlayEnabledForPage(tab.url),
          isBookmarked: window.quizzlerStorage.isUrlBookmarked(tab.url),
          isNativeTargetLang: false,
          translatorMode: false
        };
      }
    } catch (e) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        panelState.activeTabStatus = {
          url: tab?.url || "",
          title: tab?.title || "",
          overlayEnabled: tab?.url
            ? window.quizzlerStorage.isOverlayEnabledForPage(tab.url)
            : false,
          isBookmarked: tab?.url ? window.quizzlerStorage.isUrlBookmarked(tab.url) : false,
          isNativeTargetLang: false,
          translatorMode: false
        };
      } catch (_) {}
    }
    renderHeaderAndControls();
  }

  function initDefaultWord() {
    if (window.quizzlerStorage.data.selectedWord) {
      panelState.currentWord = window.quizzlerStorage.data.selectedWord;
      return;
    }
    const lang = window.quizzlerStorage.data.targetLang;
    const cards = window.quizzlerStorage.getReviewCardsArray("all", lang);
    if (cards.length > 0) {
      panelState.currentWord = cards[0];
    } else {
      panelState.currentWord = window.quizzlerStorage.lookupWordSync(
        lang === "ja" ? "狐" : "prince",
        lang
      );
    }
  }

  function renderAll() {
    renderHeaderAndControls();
    renderInspectorTab();
    if (panelState.activeTab === "translate") {
      renderTranslateTab();
    }
    if (panelState.activeTab === "flashcards") {
      renderFlashcard();
    }
    renderSitesTab();
    renderVaultTab();
  }

  function renderHeaderAndControls() {
    const { targetLang, immersionMode, furiganaMode, showRomaji, soundEnabled } =
      window.quizzlerStorage.data;
    const cfg = window.quizzlerStorage.getLangConfig(targetLang);
    const stats = window.quizzlerStorage.getVaultStats(targetLang);

    const flagEl = document.getElementById("sp-flag-badge");
    const pillEl = document.getElementById("sp-lang-pill");
    const selectEl = document.getElementById("sp-lang-select");
    const soundBtn = document.getElementById("sp-btn-sound");
    const summaryEl = document.getElementById("sp-vault-summary");
    const tabVaultCount = document.getElementById("sp-tab-vault-count");
    const immLabel = document.getElementById("sp-immersion-label");
    const jaControls = document.getElementById("sp-ja-controls");
    const furiBtn = document.getElementById("sp-btn-furigana");
    const romajiBtn = document.getElementById("sp-btn-romaji");

    const immerseLabel = document.getElementById("sp-immerse-label");
    const detectBadge = document.getElementById("sp-page-detect-badge");
    const translatorBtn = document.getElementById("sp-btn-translator-mode");
    const translatorLabel = document.getElementById("sp-translator-mode-label");
    const overlayBtn = document.getElementById("sp-btn-toggle-overlay");
    const overlayLabel = document.getElementById("sp-overlay-label");
    const bookmarkBtn = document.getElementById("sp-btn-bookmark-page");
    const bookmarkLabel = document.getElementById("sp-bookmark-label");

    if (flagEl) flagEl.textContent = cfg.flag;
    if (pillEl) pillEl.textContent = cfg.badge;
    if (selectEl && selectEl.value !== targetLang) selectEl.value = targetLang;
    if (soundBtn) soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
    if (summaryEl) {
      summaryEl.textContent = `${stats.total} cards • ${stats.mastered} mastered`;
    }
    if (tabVaultCount) tabVaultCount.textContent = String(stats.total);
    if (immLabel) {
      immLabel.textContent = immersionMode ? "Hide Ref" : "Show Ref";
    }

    const st = panelState.activeTabStatus;
    if (immerseLabel) {
      if (st?.isPageTransformed) {
        immerseLabel.textContent =
          st.mode === "native"
            ? `Immersed (${targetLang.toUpperCase()} Native)`
            : `Immersed (→ ${targetLang.toUpperCase()})`;
      } else if (st?.isNativeTargetLang) {
        immerseLabel.textContent = `Immerse (${cfg.flag} Native Page)`;
      } else {
        immerseLabel.textContent = `Translate & Immerse (→ ${cfg.flag})`;
      }
    }

    if (detectBadge) {
      if (st?.detectedPageLang) {
        detectBadge.textContent = st.isNativeTargetLang
          ? `Detected: ${cfg.flag} Native ${cfg.name}`
          : `Page: ${st.detectedPageLang.toUpperCase()} → ${targetLang.toUpperCase()}`;
      } else {
        detectBadge.textContent = "Active Tab Controls";
      }
    }

    const translatorOn = Boolean(st?.translatorMode);
    if (translatorLabel) {
      translatorLabel.textContent = translatorOn ? "Translator: ON" : "Translator Mode";
    }
    if (translatorBtn) {
      translatorBtn.className = translatorOn
        ? "pro-btn px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 text-emerald-300 border-emerald-500/40 bg-emerald-950/30"
        : "pro-btn px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 text-yellow-300 border-yellow-400/40";
    }

    const overlayOn = Boolean(
      st?.url ? window.quizzlerStorage.isOverlayEnabledForPage(st.url) : st?.overlayEnabled
    );
    if (overlayLabel) {
      overlayLabel.textContent = `Bar: ${overlayOn ? "On" : "Off"}`;
    }
    if (overlayBtn) {
      overlayBtn.className = overlayOn
        ? "pro-btn px-2 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 text-emerald-300 border-emerald-500/40 bg-emerald-950/30"
        : "pro-btn px-2 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 text-zinc-300";
    }

    const bookmarked = Boolean(
      st?.url ? window.quizzlerStorage.isUrlBookmarked(st.url) : st?.isBookmarked
    );
    if (bookmarkLabel) {
      bookmarkLabel.textContent = bookmarked ? "Saved" : "Save";
    }
    if (bookmarkBtn) {
      bookmarkBtn.className = bookmarked
        ? "pro-btn py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 shrink-0 text-yellow-300 border-yellow-400/50 bg-yellow-400/15"
        : "pro-btn py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shrink-0";
    }

    if (jaControls) {
      jaControls.classList.toggle("hidden", targetLang !== "ja");
    }
    if (furiBtn) {
      furiBtn.textContent = `あ Furigana: ${
        furiganaMode === "always"
          ? "Always"
          : furiganaMode === "hover"
          ? "Hover"
          : "Off"
      }`;
    }
    if (romajiBtn) {
      romajiBtn.textContent = `Romaji: ${showRomaji ? "On" : "Off"}`;
      romajiBtn.classList.toggle("text-yellow-300", showRomaji);
    }
  }

  // ==========================================
  // TAB 1: INSPECTOR & DICTIONARY SEARCH
  // ==========================================

  function renderInspectorTab() {
    const meta = panelState.currentWord;
    if (!meta) return;

    const lang = meta.lang || window.quizzlerStorage.data.targetLang;
    const wordEl = document.getElementById("sp-insp-word");
    const phoneticEl = document.getElementById("sp-insp-phonetic");
    const romajiEl = document.getElementById("sp-insp-romaji");
    const posEl = document.getElementById("sp-insp-pos");
    const statusEl = document.getElementById("sp-insp-status");
    const enEl = document.getElementById("sp-insp-en");
    const customBadge = document.getElementById("sp-insp-custom-badge");
    const resetBtn = document.getElementById("sp-btn-reset-def");
    const ctxTargetEl = document.getElementById("sp-insp-ctx-target");
    const ctxEnEl = document.getElementById("sp-insp-ctx-en");
    const extraBox = document.getElementById("sp-insp-extra-box");
    const toggleVaultBtn = document.getElementById("sp-btn-toggle-vault");

    if (wordEl) wordEl.textContent = meta.word || meta.cleanWord || "";

    if (lang === "ja") {
      if (phoneticEl) phoneticEl.textContent = meta.kana ? `【 ${meta.kana} 】` : "";
      if (romajiEl) {
        romajiEl.classList.toggle("hidden", !meta.romaji);
        romajiEl.textContent = meta.romaji || "";
      }
      if (posEl) {
        posEl.textContent = `${meta.pos || "名詞"}${
          meta.jlpt ? ` • JLPT ${meta.jlpt}` : ""
        }`;
      }
    } else {
      if (phoneticEl) phoneticEl.textContent = meta.ipa ? `/${meta.ipa.replace(/^\/|\/$/g, "")}/` : "";
      if (romajiEl) romajiEl.classList.add("hidden");
      if (posEl) {
        let label = meta.pos || "word";
        if (meta.gender) label += ` (${meta.gender === "m" ? "Masc." : "Fem."})`;
        posEl.textContent = label;
      }
    }

    if (enEl) enEl.textContent = meta.en || "";
    const isCustom = Boolean(
      window.quizzlerStorage.getCustomDefinition(meta.cleanWord || meta.word, lang)
    );
    if (customBadge) customBadge.classList.toggle("hidden", !isCustom);
    if (resetBtn) resetBtn.classList.toggle("hidden", !isCustom);

    const ctxTarget =
      meta.contextTarget ||
      meta.contextFr ||
      meta.contextJa ||
      meta.exampleTarget ||
      meta.exampleFr ||
      meta.exampleJa ||
      "";
    const ctxEn = meta.contextEn || meta.exampleEn || "";

    if (ctxTargetEl) {
      ctxTargetEl.textContent = ctxTarget
        ? `« ${ctxTarget} »`
        : "Click any word on a webpage or search above.";
    }
    if (ctxEnEl) {
      ctxEnEl.textContent = ctxEn ? `"${ctxEn}"` : "";
    }

    // Kanji Breakdown OR French Idioms
    if (extraBox) {
      if (lang === "ja" && Array.isArray(meta.kanji) && meta.kanji.length > 0) {
        extraBox.classList.remove("hidden");
        extraBox.innerHTML = `
          <div class="text-[10px] font-mono uppercase tracking-wider text-yellow-400 font-bold">
            漢字 Constituent Kanji (${meta.kanji.length})
          </div>
          ${meta.kanji
            .map(
              (k) => `
            <div class="kanji-breakdown-chip flex items-center justify-between cursor-pointer" data-kanji="${encodeURIComponent(
              k.char
            )}">
              <div class="flex items-center gap-2.5">
                <span class="text-xl font-black text-yellow-400 jp-font">${escapeHtml(
                  k.char
                )}</span>
                <div>
                  <div class="text-xs font-bold text-white">${escapeHtml(
                    k.meaning || ""
                  )}</div>
                  <div class="text-[10px] font-mono text-zinc-400">
                    On: ${escapeHtml(k.on || "-")} • Kun: ${escapeHtml(k.kun || "-")}
                  </div>
                </div>
              </div>
              <span class="text-xs text-yellow-400">🔊</span>
            </div>
          `
            )
            .join("")}
        `;
        extraBox.querySelectorAll("[data-kanji]").forEach((el) => {
          el.addEventListener("click", () => {
            const ch = decodeURIComponent(el.getAttribute("data-kanji") || "");
            window.quizzlerSound.speak(ch, "ja");
          });
        });
      } else {
        extraBox.classList.add("hidden");
        extraBox.innerHTML = "";
      }
    }

    const cardData = window.quizzlerStorage.getReviewWord(
      meta.cleanWord || meta.word,
      lang
    );
    if (statusEl) {
      if (cardData) {
        statusEl.textContent = `Level ${cardData.boxLevel || 1} • Reps ${
          cardData.repetitions || 0
        }`;
        statusEl.className =
          "text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/40";
      } else {
        statusEl.textContent = "Not in Vault";
        statusEl.className =
          "text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700";
      }
    }

    if (toggleVaultBtn) {
      if (cardData) {
        toggleVaultBtn.className =
          "pro-btn w-full py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center justify-center gap-2";
        toggleVaultBtn.textContent = "✓ In Flashcards Deck (Click to Remove)";
      } else {
        toggleVaultBtn.className =
          "pro-btn w-full py-2.5 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md";
        toggleVaultBtn.textContent = "⭐ + Add to Flashcards Deck";
      }
    }
  }

  async function handleDictionarySearch(query) {
    const trimmed = (query || "").trim();
    if (!trimmed) return;
    const lang = window.quizzlerStorage.data.targetLang;

    // 1. Check direct target-language or English reverse match in local DB
    if (lang === "fr" && window.FRENCH_VOCAB_DB) {
      const lower = trimmed.toLowerCase();
      if (!window.FRENCH_VOCAB_DB[lower]) {
        // Try reverse English lookup in FRENCH_VOCAB_DB
        const rev = Object.entries(window.FRENCH_VOCAB_DB).find(([_, v]) =>
          v.en.toLowerCase().includes(lower)
        );
        if (rev) {
          const found = await window.quizzlerStorage.lookupWordWithLiveFallback(
            rev[0],
            "fr"
          );
          if (found) {
            panelState.currentWord = found;
            await window.quizzlerStorage.setSelectedWord(found);
            window.quizzlerSound.speak(found.word, "fr");
            renderInspectorTab();
            return;
          }
        }
      }
    } else if (lang === "ja" && window.JAPANESE_VOCAB_DB) {
      const lower = trimmed.toLowerCase();
      if (!window.JAPANESE_VOCAB_DB[trimmed]) {
        const rev = Object.entries(window.JAPANESE_VOCAB_DB).find(
          ([_, v]) =>
            (v.en && v.en.toLowerCase().includes(lower)) ||
            (v.romaji && v.romaji.toLowerCase() === lower) ||
            (v.kana && v.kana === trimmed)
        );
        if (rev) {
          const found = await window.quizzlerStorage.lookupWordWithLiveFallback(
            rev[0],
            "ja"
          );
          if (found) {
            panelState.currentWord = found;
            await window.quizzlerStorage.setSelectedWord(found);
            window.quizzlerSound.speak(found.word, "ja");
            renderInspectorTab();
            return;
          }
        }
      }
    }

    const res = trimmed.includes(" ")
      ? await window.quizzlerStorage.lookupPhraseWithLiveFallback(trimmed, lang)
      : await window.quizzlerStorage.lookupWordWithLiveFallback(trimmed, lang);

    if (res) {
      panelState.currentWord = res;
      await window.quizzlerStorage.setSelectedWord(res);
      window.quizzlerSound.speak(res.word, lang);
      renderInspectorTab();
      showToast(`📖 Found: ${res.word}`);
    }
  }

  // ==========================================
  // TAB 2: 3D FLASHCARDS TRAINER
  // ==========================================

  function loadFlashcardDeck(filter = panelState.cardFilter) {
    panelState.cardFilter = filter;
    const lang = window.quizzlerStorage.data.targetLang;
    panelState.deck = window.quizzlerStorage.getReviewCardsArray(filter, lang);
    panelState.cardIndex = 0;
    panelState.isFlipped = false;

    document.querySelectorAll(".sp-card-filter").forEach((btn) => {
      const isAct = btn.getAttribute("data-filter") === filter;
      btn.className = isAct
        ? "sp-card-filter pro-btn px-2.5 py-1 rounded-xl text-[11px] font-bold bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
        : "sp-card-filter pro-btn px-2.5 py-1 rounded-xl text-[11px] font-semibold text-zinc-400";
    });

    renderFlashcard();
  }

  function renderFlashcard() {
    const flipper = document.getElementById("sp-card-flipper");
    if (flipper) flipper.classList.remove("is-flipped");
    panelState.isFlipped = false;

    const progressEl = document.getElementById("sp-card-progress");
    const barEl = document.getElementById("sp-card-bar");
    const card = panelState.deck[panelState.cardIndex];

    if (!card) {
      if (progressEl) progressEl.textContent = "0 / 0";
      if (barEl) barEl.style.width = "0%";
      const frontWord = document.getElementById("sp-card-front-word");
      const frontPhonetic = document.getElementById("sp-card-front-phonetic");
      const frontPos = document.getElementById("sp-card-front-pos");
      const frontCtx = document.getElementById("sp-card-front-ctx");
      if (frontWord) frontWord.textContent = "Empty Deck";
      if (frontPhonetic) frontPhonetic.textContent = "";
      if (frontPos) frontPos.textContent = "0 cards";
      if (frontCtx) {
        frontCtx.textContent =
          "Click any word on a webpage to add it to your Review Vault!";
      }
      return;
    }

    if (progressEl) {
      progressEl.textContent = `${panelState.cardIndex + 1} / ${panelState.deck.length}`;
    }
    if (barEl) {
      const pct = Math.round(((panelState.cardIndex + 1) / panelState.deck.length) * 100);
      barEl.style.width = `${pct}%`;
    }

    const levelBadge = document.getElementById("sp-card-level-badge");
    if (levelBadge) {
      const lvl = card.boxLevel || 1;
      if (lvl >= 3) {
        levelBadge.className =
          "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
        levelBadge.textContent = "Level 3 • Mastered";
      } else if (lvl === 2) {
        levelBadge.className =
          "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-yellow-400/20 text-yellow-300 border border-yellow-400/30";
        levelBadge.textContent = "Level 2 • In Review";
      } else {
        levelBadge.className =
          "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700";
        levelBadge.textContent = "Level 1 • Learning";
      }
    }

    const frontWord = document.getElementById("sp-card-front-word");
    const frontPhonetic = document.getElementById("sp-card-front-phonetic");
    const frontPos = document.getElementById("sp-card-front-pos");
    const frontCtx = document.getElementById("sp-card-front-ctx");
    const kanjiChips = document.getElementById("sp-card-kanji-chips");

    if (frontWord) frontWord.textContent = card.word;
    if (frontPhonetic) {
      frontPhonetic.textContent =
        card.lang === "ja"
          ? `${card.kana || ""}${card.romaji ? ` • ${card.romaji}` : ""}`
          : card.ipa || "";
    }
    if (frontPos) {
      frontPos.textContent = `${card.pos || "word"}${
        card.jlpt ? ` • JLPT ${card.jlpt}` : ""
      }`;
    }

    if (kanjiChips) {
      if (card.lang === "ja" && Array.isArray(card.kanji) && card.kanji.length > 0) {
        kanjiChips.classList.remove("hidden");
        kanjiChips.innerHTML = card.kanji
          .map(
            (k) => `
          <span class="px-2 py-0.5 rounded-lg bg-zinc-800 border border-zinc-700 text-[10px]">
            <strong class="text-yellow-400">${escapeHtml(k.char)}</strong> ${escapeHtml(
              k.meaning
            )}
          </span>
        `
          )
          .join("");
      } else {
        kanjiChips.classList.add("hidden");
        kanjiChips.innerHTML = "";
      }
    }

    const ctxTarget = card.exampleTarget || card.exampleFr || card.exampleJa || "";
    if (frontCtx) {
      frontCtx.textContent = ctxTarget ? `« ${ctxTarget} »` : `« ${card.word} »`;
    }

    const backWord = document.getElementById("sp-card-back-word");
    const backEn = document.getElementById("sp-card-back-en");
    const backSub = document.getElementById("sp-card-back-sub");
    const backCtxTarget = document.getElementById("sp-card-back-ctx-target");
    const backCtxEn = document.getElementById("sp-card-back-ctx-en");

    if (backWord) backWord.textContent = card.word;
    if (backEn) backEn.textContent = card.en;
    if (backSub) {
      backSub.textContent =
        card.lang === "ja" ? `${card.kana || ""} (${card.romaji || ""})` : card.ipa || "";
    }
    if (backCtxTarget) backCtxTarget.textContent = ctxTarget ? `« ${ctxTarget} »` : "";
    if (backCtxEn) backCtxEn.textContent = card.exampleEn ? `"${card.exampleEn}"` : "";
  }

  function flipSidePanelCard() {
    if (panelState.deck.length === 0) return;
    panelState.isFlipped = !panelState.isFlipped;
    window.quizzlerSound.playCardFlip();
    const flipper = document.getElementById("sp-card-flipper");
    if (flipper) {
      flipper.classList.toggle("is-flipped", panelState.isFlipped);
    }
  }

  async function rateSidePanelCard(rating) {
    if (panelState.deck.length === 0) return;
    const card = panelState.deck[panelState.cardIndex];
    if (!card) return;

    const lang = card.lang || window.quizzlerStorage.data.targetLang;
    await window.quizzlerStorage.updateCardRating(card.cleanWord || card.word, rating, lang);

    if (rating === 3) {
      window.quizzlerSound.playCorrectChime();
    } else if (rating === 2) {
      window.quizzlerSound.playTone(540, 0.14, "triangle", 0.14);
    } else {
      window.quizzlerSound.playErrorTone();
      panelState.deck.push(card);
    }

    if (panelState.cardIndex < panelState.deck.length - 1) {
      panelState.cardIndex++;
    } else {
      panelState.cardIndex = 0;
      window.quizzlerSound.playMasteryFanfare();
      showToast("🎉 Completed deck round!");
    }
    renderFlashcard();
  }

  // ==========================================
  // TAB 3: VAULT & BACKUP
  // ==========================================

  function renderVaultTab() {
    const lang = window.quizzlerStorage.data.targetLang;
    const stats = window.quizzlerStorage.getVaultStats(lang);

    const totalEl = document.getElementById("sp-stat-total");
    const learnEl = document.getElementById("sp-stat-learning");
    const mastEl = document.getElementById("sp-stat-mastered");
    if (totalEl) totalEl.textContent = String(stats.total);
    if (learnEl) learnEl.textContent = String(stats.learning);
    if (mastEl) mastEl.textContent = `${stats.mastered} (${stats.pct}%)`;

    const filterInput = document.getElementById("sp-vault-filter-input");
    const q = (filterInput?.value || "").trim().toLowerCase();

    const cards = window.quizzlerStorage
      .getReviewCardsArray("all", lang)
      .filter(
        (c) =>
          !q ||
          (c.word && c.word.toLowerCase().includes(q)) ||
          (c.en && c.en.toLowerCase().includes(q)) ||
          (c.kana && c.kana.includes(q))
      );

    const listEl = document.getElementById("sp-vault-list");
    if (!listEl) return;

    if (cards.length === 0) {
      listEl.innerHTML = `<div class="p-4 text-center text-xs text-zinc-500">No flashcards matching filter.</div>`;
      return;
    }

    listEl.innerHTML = cards
      .map((c) => {
        const isMastered = (c.boxLevel || 1) >= 3;
        return `
        <div class="p-2.5 rounded-2xl bg-zinc-900/80 border ${
          isMastered ? "border-emerald-500/30" : "border-zinc-800"
        } flex items-center justify-between gap-2 hover:border-yellow-400/50 transition cursor-pointer" data-vault-word="${encodeURIComponent(
          c.cleanWord || c.word
        )}">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-xs text-white truncate jp-font">${escapeHtml(
                c.word
              )}</span>
              <span class="text-[9px] font-mono px-1.5 py-0.2 rounded ${
                isMastered
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-yellow-400/20 text-yellow-300"
              }">L${c.boxLevel || 1}</span>
            </div>
            <div class="text-[11px] text-zinc-400 truncate">${escapeHtml(c.en)}</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button class="sp-vault-audio pro-btn w-6 h-6 rounded-lg text-[11px] text-yellow-400" data-word="${encodeURIComponent(
              c.word
            )}" title="Speak">🔊</button>
            <button class="sp-vault-del pro-btn w-6 h-6 rounded-lg text-[11px] text-zinc-400 hover:text-red-400" data-clean="${encodeURIComponent(
              c.cleanWord || c.word
            )}" title="Remove">✕</button>
          </div>
        </div>
      `;
      })
      .join("");

    listEl.querySelectorAll("[data-vault-word]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const clean = decodeURIComponent(row.getAttribute("data-vault-word") || "");
        const card = window.quizzlerStorage.getReviewWord(clean, lang);
        if (card) {
          panelState.currentWord = card;
          switchTab("inspector");
          renderInspectorTab();
        }
      });
    });

    listEl.querySelectorAll(".sp-vault-audio").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const w = decodeURIComponent(btn.getAttribute("data-word") || "");
        window.quizzlerSound.speak(w, lang);
      });
    });

    listEl.querySelectorAll(".sp-vault-del").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const clean = decodeURIComponent(btn.getAttribute("data-clean") || "");
        await window.quizzlerStorage.toggleWordInReview({ cleanWord: clean }, lang);
        renderAll();
        showToast("Removed card from Vault.");
      });
    });
  }

  // ==========================================
  // TAB 3: BOOKMARKS & RECOMMENDED NATIVE SITES
  // ==========================================

  function renderSitesTab() {
    const lang = window.quizzlerStorage.data.targetLang;
    const cfg = window.quizzlerStorage.getLangConfig(lang);

    const recTitle = document.getElementById("sp-rec-sites-title");
    const recBadge = document.getElementById("sp-rec-sites-lang-badge");
    if (recTitle) recTitle.textContent = `Recommended Native ${cfg.name} Sites`;
    if (recBadge) recBadge.textContent = `${cfg.flag} ${lang.toUpperCase()}`;

    // 1. Render Bookmarks List
    const bookmarksEl = document.getElementById("sp-bookmarks-list");
    if (bookmarksEl) {
      const bookmarks = window.quizzlerStorage.getBookmarks("all");
      if (bookmarks.length === 0) {
        bookmarksEl.innerHTML = `<div class="p-3 text-center text-xs text-zinc-500">No bookmarked pages yet. Click "+ Save Active Tab" or save a recommended site below!</div>`;
      } else {
        bookmarksEl.innerHTML = bookmarks
          .map((bm) => {
            const bmCfg = window.quizzlerStorage.getLangConfig(bm.lang || "fr");
            return `
            <div class="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-yellow-400/50 transition flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1 cursor-pointer sp-open-url" data-url="${encodeURIComponent(
                bm.url
              )}">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs">${bmCfg.flag}</span>
                  <span class="font-bold text-xs text-white truncate">${escapeHtml(
                    bm.title || bm.url
                  )}</span>
                </div>
                <div class="text-[10px] text-zinc-400 truncate font-mono">${escapeHtml(
                  bm.note || bm.url
                )}</div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" class="sp-open-url pro-btn px-2 py-1 rounded-lg text-[10px] font-bold text-yellow-300 border-yellow-400/30" data-url="${encodeURIComponent(
                  bm.url
                )}" title="Open in Tab">
                  Open ↗
                </button>
                <button type="button" class="sp-remove-bookmark pro-btn w-6 h-6 rounded-lg text-[11px] text-zinc-400 hover:text-red-400" data-url="${encodeURIComponent(
                  bm.url
                )}" title="Remove Bookmark">
                  ✕
                </button>
              </div>
            </div>
          `;
          })
          .join("");

        bookmarksEl.querySelectorAll(".sp-open-url").forEach((el) => {
          el.addEventListener("click", () => {
            const url = decodeURIComponent(el.getAttribute("data-url") || "");
            if (url) chrome.tabs.create({ url });
          });
        });

        bookmarksEl.querySelectorAll(".sp-remove-bookmark").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const url = decodeURIComponent(btn.getAttribute("data-url") || "");
            await window.quizzlerStorage.removeBookmark(url);
            renderAll();
            showToast("Removed bookmark.");
          });
        });
      }
    }

    // 2. Render Recommended Native Sites List for Active Language
    const recListEl = document.getElementById("sp-recommended-sites-list");
    if (recListEl) {
      const recSites = window.quizzlerStorage.getRecommendedSites(lang);
      recListEl.innerHTML = recSites
        .map((site) => {
          const isSaved = window.quizzlerStorage.isUrlBookmarked(site.url);
          return `
          <div class="p-3 rounded-2xl bg-zinc-900/85 border border-zinc-800 hover:border-yellow-400/40 transition space-y-1.5">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-bold text-xs text-white leading-snug">${escapeHtml(
                  site.title
                )}</div>
                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">
                    ${escapeHtml(site.level || "All Levels")}
                  </span>
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                    ${escapeHtml(site.tag || "Native")}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" class="sp-save-rec pro-btn px-2 py-1 rounded-lg text-[10px] font-semibold ${
                  isSaved ? "text-yellow-300 border-yellow-400/50" : "text-zinc-300"
                }" data-url="${encodeURIComponent(site.url)}" data-title="${encodeURIComponent(
            site.title
          )}" data-note="${encodeURIComponent(site.desc || "")}">
                  ${isSaved ? "🔖 Saved" : "🔖"}
                </button>
                <button type="button" class="sp-open-rec pro-btn px-2.5 py-1 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-bold text-[10px]" data-url="${encodeURIComponent(
                  site.url
                )}">
                  Open ↗
                </button>
              </div>
            </div>
            <p class="text-[11px] text-zinc-400 leading-relaxed">${escapeHtml(
              site.desc || ""
            )}</p>
          </div>
        `;
        })
        .join("");

      recListEl.querySelectorAll(".sp-open-rec").forEach((btn) => {
        btn.addEventListener("click", () => {
          const url = decodeURIComponent(btn.getAttribute("data-url") || "");
          if (url) chrome.tabs.create({ url });
        });
      });

      recListEl.querySelectorAll(".sp-save-rec").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const url = decodeURIComponent(btn.getAttribute("data-url") || "");
          const title = decodeURIComponent(btn.getAttribute("data-title") || "");
          const note = decodeURIComponent(btn.getAttribute("data-note") || "");
          const res = await window.quizzlerStorage.toggleBookmark({
            url,
            title,
            lang,
            note
          });
          renderAll();
          showToast(res.added ? "🔖 Added to your learning bookmarks!" : "Removed bookmark.");
        });
      });
    }
  }

  async function bookmarkCurrentActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || tab.url.startsWith("chrome")) {
        showToast("Switch to a web page tab to bookmark it.");
        return;
      }
      const res = await window.quizzlerStorage.toggleBookmark({
        url: tab.url,
        title: tab.title || tab.url,
        lang: window.quizzlerStorage.data.targetLang
      });
      await refreshActiveTabStatus();
      renderAll();
      if (res.added) {
        window.quizzlerSound.playCorrectChime();
        showToast("🔖 Bookmarked active page for language learning!");
      } else {
        showToast("Removed active page from bookmarks.");
      }
    } catch (e) {
      showToast("Could not bookmark active tab.");
    }
  }

  // ==========================================
  // KANA 50-SOUNDS CHART MODAL
  // ==========================================

  function renderKanaModal() {
    const grid = document.getElementById("sp-kana-grid");
    if (!grid || !window.JAPANESE_KANA_DATA) return;

    const list =
      panelState.kanaTab === "katakana"
        ? window.JAPANESE_KANA_DATA.katakana
        : window.JAPANESE_KANA_DATA.hiragana;

    grid.innerHTML = list
      .map((item) => {
        if (!item.kana) {
          return `<div class="p-2 rounded-xl bg-zinc-950/30 border border-zinc-900"></div>`;
        }
        return `
        <button class="kana-tile p-2 rounded-xl flex flex-col items-center justify-center text-center" data-kana="${encodeURIComponent(
          item.kana
        )}">
          <span class="text-lg font-bold text-white jp-font">${escapeHtml(item.kana)}</span>
          <span class="text-[10px] font-mono text-yellow-400">${escapeHtml(
            item.romaji
          )}</span>
        </button>
      `;
      })
      .join("");

    grid.querySelectorAll("[data-kana]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ch = decodeURIComponent(btn.getAttribute("data-kana") || "");
        window.quizzlerSound.speak(ch, "ja");
      });
    });
  }

  // ==========================================
  // TAB 2: TRANSLATOR WORKBENCH (BLOCK-BY-BLOCK)
  // ==========================================

  function getDefaultPracticeBlocks(lang) {
    const samples = {
      fr: [
        {
          blockIndex: 0,
          sourceText:
            "Lorsque j'avais six ans j'ai vu, une fois, une magnifique image, dans un livre sur la Forêt Vierge qui s'appelait « Histoires Vécues ».",
          referenceText:
            "When I was six years old I saw, once, a magnificent picture in a book about the Primeval Forest called 'True Stories'."
        },
        {
          blockIndex: 1,
          sourceText:
            "On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux.",
          referenceText:
            "One sees clearly only with the heart. What is essential is invisible to the eye."
        },
        {
          blockIndex: 2,
          sourceText:
            "C'est le temps que tu as perdu pour ta rose qui fait ta rose si importante.",
          referenceText:
            "It is the time you have wasted for your rose that makes your rose so important."
        }
      ],
      ja: [
        {
          blockIndex: 0,
          sourceText: "昔々、静かな森の近くに小さな村がありました。",
          referenceText: "Once upon a time, there was a small village near a quiet forest."
        },
        {
          blockIndex: 1,
          sourceText: "その森には、賢くて優しい白い狐が住んでいました。",
          referenceText: "In that forest lived a wise and kind white fox."
        }
      ],
      es: [
        {
          blockIndex: 0,
          sourceText:
            "Sólo con el corazón se puede ver bien; lo esencial es invisible para los ojos.",
          referenceText:
            "Only with the heart can one see well; what is essential is invisible to the eyes."
        }
      ],
      de: [
        {
          blockIndex: 0,
          sourceText:
            "Man sieht nur mit dem Herzen gut. Das Wesentliche ist für die Augen unsichtbar.",
          referenceText:
            "One sees well only with the heart. The essential is invisible to the eyes."
        }
      ],
      it: [
        {
          blockIndex: 0,
          sourceText:
            "Non si vede bene che col cuore. L'essenziale è invisibile agli occhi.",
          referenceText:
            "One sees well only with the heart. What is essential is invisible to the eyes."
        }
      ]
    };
    return samples[lang] || samples.fr;
  }

  function getActiveWorkbenchBlocks() {
    if (panelState.translateMode === "custom" && panelState.customBlocks.length > 0) {
      return panelState.customBlocks;
    }
    if (panelState.pageBlocks.length > 0) {
      return panelState.pageBlocks;
    }
    const lang = window.quizzlerStorage.data.targetLang;
    return getDefaultPracticeBlocks(lang);
  }

  async function syncBlocksFromActivePage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url && !tab.url.startsWith("chrome")) {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_BLOCKS" });
        if (res?.ok && Array.isArray(res.blocks) && res.blocks.length > 0) {
          panelState.pageBlocks = res.blocks;
          panelState.pageKey = res.pageKey || window.quizzlerStorage.getPageKey(tab.url);
          if (panelState.activeBlockCursor >= panelState.pageBlocks.length) {
            panelState.activeBlockCursor = 0;
          }
          renderTranslateTab();
          return;
        }
      }
    } catch (e) {}

    const lang = window.quizzlerStorage.data.targetLang;
    panelState.pageKey = `practice_${lang}`;
    panelState.pageBlocks = getDefaultPracticeBlocks(lang);
    panelState.activeBlockCursor = 0;
    renderTranslateTab();
  }

  function tokenizeSidePanelPassage(text, lang) {
    if (!text) return "";
    if (lang === "ja") {
      const rubyHtml = window.quizzlerStorage.annotateJapaneseWithRuby(text);
      const tokenRegex =
        /(<ruby>.*?<\/ruby>)|([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)|([、。！？「」『』（）…・.,!?:;]+)|(\s+)/g;
      let match;
      let html = "";
      while ((match = tokenRegex.exec(rubyHtml)) !== null) {
        if (match[1]) {
          const baseKanji = match[1]
            .replace(/<rt>.*?<\/rt>/g, "")
            .replace(/<[^>]+>/g, "")
            .trim();
          html += `<span class="sp-source-word cursor-pointer px-0.5 rounded hover:bg-yellow-400/25 border-b border-transparent hover:border-yellow-400 transition" data-word="${encodeURIComponent(
            baseKanji
          )}">${match[1]}</span>`;
        } else if (match[2]) {
          html += `<span class="sp-source-word cursor-pointer px-0.5 rounded hover:bg-yellow-400/25 border-b border-transparent hover:border-yellow-400 transition" data-word="${encodeURIComponent(
            match[2]
          )}">${escapeHtml(match[2])}</span>`;
        } else if (match[3]) {
          html += escapeHtml(match[3]);
        } else if (match[4]) {
          html += match[4];
        }
      }
      return html;
    }

    const tokenRegex =
      /([a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ'’ʼ]+)|([^a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ'’ʼ]+)/g;
    let match;
    let html = "";
    while ((match = tokenRegex.exec(text)) !== null) {
      if (match[1]) {
        html += `<span class="sp-source-word cursor-pointer px-0.5 rounded hover:bg-yellow-400/25 border-b border-transparent hover:border-yellow-400 transition" data-word="${encodeURIComponent(
          match[1]
        )}">${escapeHtml(match[1])}</span>`;
      } else if (match[2]) {
        html += escapeHtml(match[2]);
      }
    }
    return html;
  }

  function renderSideDiffReference(userText, refEn) {
    if (!refEn) return `<span class="text-zinc-400 italic">Click "🔍 Check & Compare" to fetch & diff the reference translation.</span>`;
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
          return `<span class="px-1 rounded bg-emerald-500/25 text-emerald-300 border-b border-emerald-400 font-semibold" title="Matched key word">${escapeHtml(
            tok.text
          )}</span>`;
        }
        if (tok.status === "missed") {
          return `<span class="px-1 rounded bg-amber-500/20 text-amber-300 border-b border-dashed border-amber-400" title="Missed or paraphrased key word">${escapeHtml(
            tok.text
          )}</span>`;
        }
        return escapeHtml(tok.text);
      })
      .join("");
  }

  function renderTranslateTab() {
    const blocks = getActiveWorkbenchBlocks();
    const lang = window.quizzlerStorage.data.targetLang;
    const pageKey =
      panelState.translateMode === "custom" ? "custom_workbench" : panelState.pageKey;

    if (panelState.activeBlockCursor >= blocks.length) {
      panelState.activeBlockCursor = 0;
    }

    // Mode toggle styles
    const btnPageMode = document.getElementById("sp-trans-mode-page");
    const btnCustomMode = document.getElementById("sp-trans-mode-custom");
    const customBox = document.getElementById("sp-trans-custom-box");
    if (btnPageMode && btnCustomMode) {
      const isPage = panelState.translateMode === "page";
      btnPageMode.className = isPage
        ? "pro-btn px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
        : "pro-btn px-2.5 py-1 rounded-xl text-[10.5px] font-semibold text-zinc-400";
      btnCustomMode.className = !isPage
        ? "pro-btn px-2.5 py-1 rounded-xl text-[10.5px] font-bold bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
        : "pro-btn px-2.5 py-1 rounded-xl text-[10.5px] font-semibold text-zinc-400";
    }
    if (customBox) {
      customBox.classList.toggle("hidden", panelState.translateMode !== "custom");
    }

    // Compute progress stats
    const stats = window.quizzlerStorage.getPageTranslationStats(pageKey, blocks.length);
    const statsLine = document.getElementById("sp-trans-stats-line");
    const avgBadge = document.getElementById("sp-trans-avg-badge");
    const progBar = document.getElementById("sp-trans-progress-bar");

    if (statsLine) {
      statsLine.textContent = `${stats.translatedCount} / ${stats.totalBlocks} blocks translated (${stats.percentTranslated}%)`;
    }
    if (avgBadge) {
      avgBadge.textContent =
        stats.scoredCount > 0 ? `★ ${stats.avgScore} / 4` : "★ -- / 4";
    }
    if (progBar) {
      progBar.style.width = `${stats.percentTranslated}%`;
    }

    // Populate block selector dropdown
    const selectEl = document.getElementById("sp-trans-block-select");
    if (selectEl) {
      selectEl.innerHTML = blocks
        .map((b, idx) => {
          const bIdx = b.blockIndex ?? idx;
          const saved = window.quizzlerStorage.getPageBlockData(pageKey, bIdx);
          const statusTag =
            saved.score !== null && saved.score !== undefined
              ? ` ★${saved.score}/4`
              : saved.text && saved.text.trim()
              ? " • Draft"
              : "";
          const preview = (b.sourceText || "").slice(0, 28).replace(/\s+/g, " ");
          return `<option value="${idx}" ${
            idx === panelState.activeBlockCursor ? "selected" : ""
          }>Block #${idx + 1}${statusTag} — ${escapeHtml(preview)}…</option>`;
        })
        .join("");
    }

    const activeBlock = blocks[panelState.activeBlockCursor];
    if (!activeBlock) return;

    const bIdx = activeBlock.blockIndex ?? panelState.activeBlockCursor;
    const saved = window.quizzlerStorage.getPageBlockData(pageKey, bIdx);
    const sourceText = activeBlock.sourceText || "";
    const refEn = activeBlock.referenceText || saved.referenceText || "";

    const blockLabel = document.getElementById("sp-trans-block-label");
    if (blockLabel) {
      blockLabel.textContent = `Block #${panelState.activeBlockCursor + 1} of ${
        blocks.length
      } • Click any word to inspect`;
    }

    const sourceTokensEl = document.getElementById("sp-trans-source-tokens");
    if (sourceTokensEl) {
      sourceTokensEl.innerHTML = tokenizeSidePanelPassage(sourceText, lang);
      sourceTokensEl.querySelectorAll(".sp-source-word").forEach((wordSpan) => {
        wordSpan.addEventListener("click", async () => {
          const rawW = decodeURIComponent(wordSpan.getAttribute("data-word") || "");
          if (!rawW) return;
          window.quizzlerSound.speak(rawW, lang);
          const meta = await window.quizzlerStorage.lookupWordWithLiveFallback(
            rawW,
            lang,
            sourceText,
            refEn
          );
          if (meta) {
            panelState.currentWord = meta;
            await window.quizzlerStorage.setSelectedWord(meta);
            const peekBox = document.getElementById("sp-trans-word-peek");
            const peekWord = document.getElementById("sp-trans-peek-word");
            const peekEn = document.getElementById("sp-trans-peek-en");
            if (peekBox && peekWord && peekEn) {
              peekBox.classList.remove("hidden");
              peekWord.textContent = meta.word;
              peekEn.textContent = meta.en;
            }
          }
        });
      });
    }

    // Reset glossary box when switching blocks
    const glossaryBox = document.getElementById("sp-trans-glossary-box");
    if (glossaryBox && glossaryBox.getAttribute("data-block-key") !== `${pageKey}_${bIdx}`) {
      glossaryBox.classList.add("hidden");
      glossaryBox.removeAttribute("data-loaded");
      glossaryBox.setAttribute("data-block-key", `${pageKey}_${bIdx}`);
    }

    const draftInput = document.getElementById("sp-trans-draft-input");
    if (draftInput && document.activeElement !== draftInput) {
      draftInput.value = saved.text || "";
    }

    const matchBadge = document.getElementById("sp-trans-match-badge");
    if (matchBadge) {
      if (saved.text && saved.text.trim() && refEn) {
        const evalRes = window.quizzlerStorage.evaluateTranslationMatch(saved.text, refEn);
        matchBadge.classList.remove("hidden");
        matchBadge.textContent = `🎯 ${evalRes.matchPct}% Match`;
      } else {
        matchBadge.classList.add("hidden");
      }
    }

    // Star buttons
    document.querySelectorAll(".sp-trans-star-btn").forEach((btn) => {
      const sc = Number(btn.getAttribute("data-score"));
      const isAct = saved.score === sc;
      btn.className = isAct
        ? "sp-trans-star-btn pro-btn py-1.5 rounded-xl text-[10px] font-bold bg-yellow-400/25 text-yellow-300 border-yellow-400"
        : "sp-trans-star-btn pro-btn py-1.5 rounded-xl text-[10px] font-bold text-zinc-400";
    });

    // Reference box
    const isRevealed =
      !window.quizzlerStorage.data.immersionMode ||
      panelState.revealedSideBlocks.has(`${pageKey}_${bIdx}`) ||
      Boolean(saved.text && saved.text.trim());
    const refBox = document.getElementById("sp-trans-ref-box");
    const refTextEl = document.getElementById("sp-trans-ref-text");
    const revealBtn = document.getElementById("sp-trans-btn-reveal");

    if (refBox) {
      refBox.classList.toggle("hidden", !isRevealed);
    }
    if (revealBtn) {
      revealBtn.textContent = isRevealed ? "🙈 Hide Ref" : "👁️ Peek Ref";
    }
    if (refTextEl) {
      refTextEl.innerHTML = renderSideDiffReference(saved.text || "", refEn);
    }
  }

  async function ensureActiveSideBlockReference() {
    const blocks = getActiveWorkbenchBlocks();
    const activeBlock = blocks[panelState.activeBlockCursor];
    if (!activeBlock) return "";

    const pageKey =
      panelState.translateMode === "custom" ? "custom_workbench" : panelState.pageKey;
    const bIdx = activeBlock.blockIndex ?? panelState.activeBlockCursor;
    const saved = window.quizzlerStorage.getPageBlockData(pageKey, bIdx);

    if (activeBlock.referenceText) return activeBlock.referenceText;
    if (saved.referenceText) {
      activeBlock.referenceText = saved.referenceText;
      return saved.referenceText;
    }

    const lang = window.quizzlerStorage.data.targetLang;
    try {
      const res = await chrome.runtime.sendMessage({
        type: "TRANSLATE_SINGLE",
        text: activeBlock.sourceText,
        sourceLang: lang,
        targetLang: "en"
      });
      if (res?.translatedText) {
        activeBlock.referenceText = res.translatedText;
        return res.translatedText;
      }
    } catch (e) {}
    return "";
  }

  async function checkAndCompareSideBlock() {
    const blocks = getActiveWorkbenchBlocks();
    const activeBlock = blocks[panelState.activeBlockCursor];
    if (!activeBlock) return;

    const pageKey =
      panelState.translateMode === "custom" ? "custom_workbench" : panelState.pageKey;
    const bIdx = activeBlock.blockIndex ?? panelState.activeBlockCursor;
    const draftInput = document.getElementById("sp-trans-draft-input");
    const userDraft = (draftInput?.value || "").trim();

    const refEn = await ensureActiveSideBlockReference();
    await window.quizzlerStorage.savePageBlockTranslation(
      pageKey,
      bIdx,
      userDraft,
      activeBlock.sourceText,
      refEn
    );

    panelState.revealedSideBlocks.add(`${pageKey}_${bIdx}`);
    const evalRes = window.quizzlerStorage.evaluateTranslationMatch(userDraft, refEn);

    if (userDraft && evalRes.suggestedScore !== null) {
      const saved = window.quizzlerStorage.getPageBlockData(pageKey, bIdx);
      const scoreToApply =
        saved.score !== null && saved.score !== undefined
          ? saved.score
          : evalRes.suggestedScore;
      await window.quizzlerStorage.savePageBlockScore(
        pageKey,
        bIdx,
        scoreToApply,
        activeBlock.sourceText,
        refEn
      );
      if (scoreToApply >= 3) {
        window.quizzlerSound.playCorrectChime();
      } else {
        window.quizzlerSound.playHintChime();
      }
      showToast(`🎯 ${evalRes.matchPct}% Match! Rated ★ ${scoreToApply}/4`);
    } else {
      window.quizzlerSound.playHintChime();
    }

    renderTranslateTab();
  }

  async function exportSidePanelManuscript() {
    if (panelState.translateMode === "page") {
      const res = await sendToActiveTab({ type: "EXPORT_PAGE_MANUSCRIPT" });
      if (res?.ok) {
        showToast(`📄 Copied Bilingual Manuscript (${res.count} blocks) to clipboard!`);
        return;
      }
    }

    const blocks = getActiveWorkbenchBlocks();
    const pageKey =
      panelState.translateMode === "custom" ? "custom_workbench" : panelState.pageKey;
    const lang = window.quizzlerStorage.data.targetLang;
    const cfg = window.quizzlerStorage.getLangConfig(lang);

    const lines = [
      `# Quizzler Bilingual Translation Manuscript (${cfg.flag} ${cfg.name})`,
      `- **Exported**: ${new Date().toLocaleString()}`,
      ""
    ];

    let count = 0;
    blocks.forEach((b, i) => {
      const bIdx = b.blockIndex ?? i;
      const saved = window.quizzlerStorage.getPageBlockData(pageKey, bIdx);
      if ((saved.text && saved.text.trim()) || saved.score !== null) {
        count++;
        lines.push(`### Block #${i + 1}${saved.score !== null ? ` (★ ${saved.score}/4)` : ""}`);
        lines.push(`> **Source (${lang.toUpperCase()})**: ${b.sourceText}`);
        lines.push("");
        lines.push(`- **My Translation**: ${saved.text || "_No draft_"}`);
        if (b.referenceText || saved.referenceText) {
          lines.push(`- **Reference (EN)**: ${b.referenceText || saved.referenceText}`);
        }
        lines.push("");
      }
    });

    if (count === 0) {
      showToast("⚠️ Translate at least one block first to export your manuscript!");
      return;
    }

    await navigator.clipboard.writeText(lines.join("\n"));
    window.quizzlerSound.playCorrectChime();
    showToast(`📄 Copied Bilingual Manuscript (${count} blocks) to clipboard!`);
  }

  // ==========================================
  // EVENTS & ACTIVE TAB MESSAGING
  // ==========================================

  async function sendToActiveTab(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        showToast("No active web tab found.");
        return null;
      }
      const res = await chrome.tabs.sendMessage(tab.id, message);
      await refreshActiveTabStatus();
      return res;
    } catch (e) {
      showToast("Please refresh the webpage once to activate Quizzler on this tab.");
      return null;
    }
  }

  function switchTab(tabName) {
    panelState.activeTab = tabName;
    document.querySelectorAll(".sp-nav-tab").forEach((btn) => {
      const isAct = btn.getAttribute("data-tab") === tabName;
      btn.className = isAct
        ? "sp-nav-tab flex-1 py-2 rounded-t-xl text-[10.5px] font-bold border-b-2 border-yellow-400 text-yellow-400 bg-zinc-900/80"
        : "sp-nav-tab flex-1 py-2 rounded-t-xl text-[10.5px] font-bold border-b-2 border-transparent text-zinc-400 hover:text-white";
    });

    document
      .getElementById("sp-view-inspector")
      ?.classList.toggle("hidden", tabName !== "inspector");
    document
      .getElementById("sp-view-translate")
      ?.classList.toggle("hidden", tabName !== "translate");
    document
      .getElementById("sp-view-flashcards")
      ?.classList.toggle("hidden", tabName !== "flashcards");
    document
      .getElementById("sp-view-sites")
      ?.classList.toggle("hidden", tabName !== "sites");
    document
      .getElementById("sp-view-vault")
      ?.classList.toggle("hidden", tabName !== "vault");

    if (tabName === "translate") {
      if (panelState.translateMode === "page") {
        syncBlocksFromActivePage();
      } else {
        renderTranslateTab();
      }
    } else if (tabName === "flashcards") {
      loadFlashcardDeck(panelState.cardFilter);
    } else if (tabName === "sites") {
      renderSitesTab();
    } else if (tabName === "vault") {
      renderVaultTab();
    }
  }

  function bindPanelEvents() {
    document.getElementById("sp-lang-select")?.addEventListener("change", async (e) => {
      await window.quizzlerStorage.setTargetLang(e.target.value);
      initDefaultWord();
      loadFlashcardDeck("all");
      await refreshActiveTabStatus();
      if (panelState.activeTab === "translate") {
        await syncBlocksFromActivePage();
      }
      renderAll();
    });

    document.getElementById("sp-btn-sound")?.addEventListener("click", async () => {
      const enabled = window.quizzlerSound.toggleSound();
      window.quizzlerStorage.data.soundEnabled = enabled;
      await window.quizzlerStorage.save();
      renderHeaderAndControls();
    });

    document.getElementById("sp-btn-open-studio")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_STUDIO_TAB" });
    });

    // Unified Smart Immerse Button (auto-detects native vs translate)
    document.getElementById("sp-btn-immerse-page")?.addEventListener("click", async () => {
      await sendToActiveTab({ type: "TRIGGER_SMART_IMMERSE_PAGE" });
      if (panelState.activeTab === "translate") {
        await syncBlocksFromActivePage();
      }
    });

    // On-Page Translator Mode Toggle Button
    document
      .getElementById("sp-btn-translator-mode")
      ?.addEventListener("click", async () => {
        const res = await sendToActiveTab({ type: "TOGGLE_TRANSLATOR_MODE" });
        if (res?.ok) {
          await syncBlocksFromActivePage();
        }
      });

    // Translator Workbench Tab Controls
    document.getElementById("sp-trans-mode-page")?.addEventListener("click", () => {
      panelState.translateMode = "page";
      syncBlocksFromActivePage();
    });

    document.getElementById("sp-trans-mode-custom")?.addEventListener("click", () => {
      panelState.translateMode = "custom";
      renderTranslateTab();
    });

    document.getElementById("sp-trans-btn-refresh")?.addEventListener("click", () => {
      panelState.translateMode = "page";
      syncBlocksFromActivePage();
      showToast("🔄 Synced blocks from active webpage.");
    });

    document.getElementById("sp-trans-btn-export")?.addEventListener("click", () => {
      exportSidePanelManuscript();
    });

    document
      .getElementById("sp-trans-btn-load-custom")
      ?.addEventListener("click", async () => {
        const input = document.getElementById("sp-trans-custom-input");
        const raw = (input?.value || "").trim();
        if (!raw) {
          showToast("Paste a paragraph or story excerpt first!");
          return;
        }
        const paragraphs = raw
          .split(/\n\s*\n+|\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 4);
        panelState.customBlocks = paragraphs.map((p, idx) => ({
          blockIndex: idx,
          sourceText: p,
          referenceText: ""
        }));
        panelState.translateMode = "custom";
        panelState.activeBlockCursor = 0;
        renderTranslateTab();
        showToast(`✍️ Loaded ${panelState.customBlocks.length} block(s) into Workbench!`);
      });

    document.getElementById("sp-trans-prev")?.addEventListener("click", () => {
      const blocks = getActiveWorkbenchBlocks();
      if (blocks.length === 0) return;
      panelState.activeBlockCursor =
        (panelState.activeBlockCursor - 1 + blocks.length) % blocks.length;
      renderTranslateTab();
    });

    document.getElementById("sp-trans-next")?.addEventListener("click", () => {
      const blocks = getActiveWorkbenchBlocks();
      if (blocks.length === 0) return;
      panelState.activeBlockCursor = (panelState.activeBlockCursor + 1) % blocks.length;
      renderTranslateTab();
    });

    document.getElementById("sp-trans-block-select")?.addEventListener("change", (e) => {
      panelState.activeBlockCursor = Number(e.target.value) || 0;
      renderTranslateTab();
    });

    document.getElementById("sp-trans-scroll-page")?.addEventListener("click", () => {
      const blocks = getActiveWorkbenchBlocks();
      const activeBlock = blocks[panelState.activeBlockCursor];
      if (!activeBlock) return;
      const bIdx = activeBlock.blockIndex ?? panelState.activeBlockCursor;
      sendToActiveTab({
        type: "SCROLL_TO_BLOCK",
        blockIndex: bIdx,
        openWorkbench: true
      });
    });

    document.getElementById("sp-trans-btn-speak")?.addEventListener("click", () => {
      const blocks = getActiveWorkbenchBlocks();
      const activeBlock = blocks[panelState.activeBlockCursor];
      if (activeBlock?.sourceText) {
        window.quizzlerSound.speak(
          activeBlock.sourceText,
          window.quizzlerStorage.data.targetLang
        );
      }
    });

    document.getElementById("sp-trans-peek-open-insp")?.addEventListener("click", () => {
      switchTab("inspector");
      renderInspectorTab();
    });

    document
      .getElementById("sp-trans-btn-glossary")
      ?.addEventListener("click", async () => {
        const glossaryBox = document.getElementById("sp-trans-glossary-box");
        if (!glossaryBox) return;
        if (!glossaryBox.classList.contains("hidden")) {
          glossaryBox.classList.add("hidden");
          return;
        }
        glossaryBox.classList.remove("hidden");
        if (glossaryBox.getAttribute("data-loaded") === "1") return;

        const blocks = getActiveWorkbenchBlocks();
        const activeBlock = blocks[panelState.activeBlockCursor];
        if (!activeBlock?.sourceText) return;

        const lang = window.quizzlerStorage.data.targetLang;
        const rawWords =
          lang === "ja"
            ? activeBlock.sourceText.match(/[一-龯々〆ヵヶ]{1,4}[ぁ-ん]{0,2}|[ァ-ヶー]{2,}/g) ||
              []
            : activeBlock.sourceText.match(/[a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ'’ʼ]{4,}/g) || [];
        const uniqueWords = Array.from(new Set(rawWords)).slice(0, 8);

        if (uniqueWords.length === 0) {
          glossaryBox.innerHTML = `<span class="text-[11px] text-zinc-400">Click any word in the source passage above to inspect its meaning.</span>`;
          return;
        }

        glossaryBox.innerHTML = `<span class="text-[11px] text-yellow-300">⏳ Loading vocabulary hints...</span>`;
        const refEn = await ensureActiveSideBlockReference();
        const chips = [];

        for (const w of uniqueWords) {
          const meta = await window.quizzlerStorage.lookupWordWithLiveFallback(
            w,
            lang,
            activeBlock.sourceText,
            refEn
          );
          if (meta && meta.en) {
            chips.push(`
              <button type="button" class="sp-glossary-chip px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-yellow-400 text-[11px] flex items-center gap-1 transition" data-word="${encodeURIComponent(
                meta.word
              )}">
                <strong class="text-yellow-300">${escapeHtml(meta.word)}</strong>
                <span class="text-zinc-500">→</span>
                <span class="text-zinc-200">${escapeHtml(meta.en)}</span>
              </button>
            `);
          }
        }

        glossaryBox.setAttribute("data-loaded", "1");
        glossaryBox.innerHTML =
          chips.length > 0
            ? chips.join("")
            : `<span class="text-[11px] text-zinc-400">Click any word in the passage above for live lookup.</span>`;

        glossaryBox.querySelectorAll(".sp-glossary-chip").forEach((chip) => {
          chip.addEventListener("click", async () => {
            const w = decodeURIComponent(chip.getAttribute("data-word") || "");
            if (!w) return;
            const meta = await window.quizzlerStorage.lookupWordWithLiveFallback(
              w,
              lang,
              activeBlock.sourceText,
              refEn
            );
            if (meta) {
              panelState.currentWord = meta;
              await window.quizzlerStorage.setSelectedWord(meta);
              window.quizzlerSound.speak(meta.word, lang);
              showToast(`📖 ${meta.word} : ${meta.en}`);
            }
          });
        });
      });

    document
      .getElementById("sp-trans-draft-input")
      ?.addEventListener("input", async (e) => {
        const blocks = getActiveWorkbenchBlocks();
        const activeBlock = blocks[panelState.activeBlockCursor];
        if (!activeBlock) return;
        const pageKey =
          panelState.translateMode === "custom" ? "custom_workbench" : panelState.pageKey;
        const bIdx = activeBlock.blockIndex ?? panelState.activeBlockCursor;
        await window.quizzlerStorage.savePageBlockTranslation(
          pageKey,
          bIdx,
          e.target.value,
          activeBlock.sourceText,
          activeBlock.referenceText || ""
        );
      });

    document
      .getElementById("sp-trans-draft-input")
      ?.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          checkAndCompareSideBlock();
        }
      });

    document
      .getElementById("sp-trans-btn-check")
      ?.addEventListener("click", () => checkAndCompareSideBlock());

    document
      .getElementById("sp-trans-btn-reveal")
      ?.addEventListener("click", async () => {
        const blocks = getActiveWorkbenchBlocks();
        const activeBlock = blocks[panelState.activeBlockCursor];
        if (!activeBlock) return;
        const pageKey =
          panelState.translateMode === "custom" ? "custom_workbench" : panelState.pageKey;
        const bIdx = activeBlock.blockIndex ?? panelState.activeBlockCursor;
        const key = `${pageKey}_${bIdx}`;

        if (panelState.revealedSideBlocks.has(key)) {
          panelState.revealedSideBlocks.delete(key);
        } else {
          await ensureActiveSideBlockReference();
          panelState.revealedSideBlocks.add(key);
          window.quizzlerSound.playHintChime();
        }
        renderTranslateTab();
      });

    document
      .getElementById("sp-trans-btn-next-untranslated")
      ?.addEventListener("click", () => {
        const blocks = getActiveWorkbenchBlocks();
        if (blocks.length === 0) return;
        const pageKey =
          panelState.translateMode === "custom" ? "custom_workbench" : panelState.pageKey;

        let foundIdx = -1;
        for (let i = 1; i <= blocks.length; i++) {
          const cand = (panelState.activeBlockCursor + i) % blocks.length;
          const bIdx = blocks[cand].blockIndex ?? cand;
          const saved = window.quizzlerStorage.getPageBlockData(pageKey, bIdx);
          if (!saved?.text || !saved.text.trim()) {
            foundIdx = cand;
            break;
          }
        }
        panelState.activeBlockCursor =
          foundIdx >= 0 ? foundIdx : (panelState.activeBlockCursor + 1) % blocks.length;
        renderTranslateTab();
      });

    document.querySelectorAll(".sp-trans-star-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const score = Number(btn.getAttribute("data-score"));
        const blocks = getActiveWorkbenchBlocks();
        const activeBlock = blocks[panelState.activeBlockCursor];
        if (!activeBlock) return;
        const pageKey =
          panelState.translateMode === "custom" ? "custom_workbench" : panelState.pageKey;
        const bIdx = activeBlock.blockIndex ?? panelState.activeBlockCursor;
        const refEn = await ensureActiveSideBlockReference();
        await window.quizzlerStorage.savePageBlockScore(
          pageKey,
          bIdx,
          score,
          activeBlock.sourceText,
          refEn
        );
        if (score >= 3) {
          window.quizzlerSound.playCorrectChime();
        } else {
          window.quizzlerSound.playTone(440, 0.12, "triangle", 0.12);
        }
        renderTranslateTab();
        showToast(`Saved rating: ★ ${score} / 4`);
      });
    });

    // Bookmark Active Tab Button
    document
      .getElementById("sp-btn-bookmark-page")
      ?.addEventListener("click", () => bookmarkCurrentActiveTab());

    document
      .getElementById("sp-btn-bookmark-current-in-tab")
      ?.addEventListener("click", () => bookmarkCurrentActiveTab());

    // Custom URL Bookmark Form
    document
      .getElementById("sp-add-bookmark-form")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("sp-bookmark-url-input");
        const rawUrl = (input?.value || "").trim();
        if (!rawUrl) return;
        let title = rawUrl;
        try {
          const parsed = new URL(rawUrl);
          title = `${parsed.hostname}${parsed.pathname !== "/" ? parsed.pathname : ""}`;
        } catch (_) {}
        await window.quizzlerStorage.toggleBookmark({
          url: rawUrl,
          title,
          lang: window.quizzlerStorage.data.targetLang
        });
        if (input) input.value = "";
        renderAll();
        showToast("🔖 Added URL to learning bookmarks!");
      });

    // Per-Site Floating Overlay Bar Toggle (Defaults to Off)
    document
      .getElementById("sp-btn-toggle-overlay")
      ?.addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url || tab.url.startsWith("chrome")) {
          showToast("Switch to a web page tab to toggle the overlay bar.");
          return;
        }
        const res = await sendToActiveTab({ type: "TOGGLE_FLOATING_BAR" });
        if (!res) {
          // Even if content script wasn't loaded yet, toggle in storage
          const next = await window.quizzlerStorage.toggleOverlayForPage(tab.url);
          await refreshActiveTabStatus();
          showToast(
            next
              ? "🧭 Overlay bar enabled for this page."
              : "Overlay bar hidden for this page."
          );
        }
      });

    document.getElementById("sp-btn-restore-page")?.addEventListener("click", () => {
      sendToActiveTab({ type: "TRIGGER_RESTORE_PAGE" });
    });

    document
      .getElementById("sp-btn-immersion-mode")
      ?.addEventListener("click", async () => {
        await window.quizzlerStorage.setImmersionMode(
          !window.quizzlerStorage.data.immersionMode
        );
        renderHeaderAndControls();
      });

    document.getElementById("sp-btn-furigana")?.addEventListener("click", async () => {
      const order = ["always", "hover", "off"];
      const curr = window.quizzlerStorage.data.furiganaMode || "always";
      const next = order[(order.indexOf(curr) + 1) % order.length];
      await window.quizzlerStorage.setFuriganaMode(next);
      renderHeaderAndControls();
    });

    document.getElementById("sp-btn-romaji")?.addEventListener("click", async () => {
      await window.quizzlerStorage.toggleRomaji();
      renderHeaderAndControls();
    });

    document.getElementById("sp-btn-kana-chart")?.addEventListener("click", () => {
      document.getElementById("sp-modal-kana")?.classList.remove("hidden");
      renderKanaModal();
    });

    document.getElementById("sp-close-kana")?.addEventListener("click", () => {
      document.getElementById("sp-modal-kana")?.classList.add("hidden");
    });

    document.getElementById("sp-kana-hira")?.addEventListener("click", () => {
      panelState.kanaTab = "hiragana";
      renderKanaModal();
    });

    document.getElementById("sp-kana-kata")?.addEventListener("click", () => {
      panelState.kanaTab = "katakana";
      renderKanaModal();
    });

    // Nav tabs
    document.querySelectorAll(".sp-nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        switchTab(btn.getAttribute("data-tab") || "inspector");
      });
    });

    // Search form
    document.getElementById("sp-search-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("sp-search-input");
      if (input) handleDictionarySearch(input.value);
    });

    // Inspector actions
    document.getElementById("sp-insp-audio")?.addEventListener("click", () => {
      if (panelState.currentWord) {
        window.quizzlerSound.speak(
          panelState.currentWord.word,
          panelState.currentWord.lang || window.quizzlerStorage.data.targetLang
        );
      }
    });

    document.getElementById("sp-btn-toggle-vault")?.addEventListener("click", async () => {
      if (!panelState.currentWord) return;
      const added = await window.quizzlerStorage.toggleWordInReview(
        panelState.currentWord
      );
      if (added) {
        window.quizzlerSound.playCorrectChime();
        showToast(`⭐ Added "${panelState.currentWord.word}" to Vault!`);
      } else {
        window.quizzlerSound.playTone(280, 0.15, "sawtooth", 0.1);
        showToast(`Removed "${panelState.currentWord.word}" from Vault.`);
      }
      renderAll();
    });

    document.getElementById("sp-btn-edit-def")?.addEventListener("click", () => {
      const form = document.getElementById("sp-insp-edit-form");
      const input = document.getElementById("sp-insp-edit-input");
      if (form && input && panelState.currentWord) {
        form.classList.remove("hidden");
        input.value = panelState.currentWord.en || "";
        input.focus();
      }
    });

    document.getElementById("sp-btn-cancel-def")?.addEventListener("click", () => {
      document.getElementById("sp-insp-edit-form")?.classList.add("hidden");
    });

    document.getElementById("sp-btn-save-def")?.addEventListener("click", async () => {
      const input = document.getElementById("sp-insp-edit-input");
      if (!input || !panelState.currentWord) return;
      const val = input.value.trim();
      if (!val) return;
      await window.quizzlerStorage.setCustomDefinition(
        panelState.currentWord.cleanWord || panelState.currentWord.word,
        val,
        panelState.currentWord.lang
      );
      panelState.currentWord.en = val;
      document.getElementById("sp-insp-edit-form")?.classList.add("hidden");
      window.quizzlerSound.playCorrectChime();
      renderInspectorTab();
      showToast("Saved custom definition!");
    });

    document.getElementById("sp-btn-reset-def")?.addEventListener("click", async () => {
      if (!panelState.currentWord) return;
      await window.quizzlerStorage.resetCustomDefinition(
        panelState.currentWord.cleanWord || panelState.currentWord.word,
        panelState.currentWord.originalEn || "",
        panelState.currentWord.lang
      );
      renderInspectorTab();
      showToast("Restored default definition.");
    });

    // Flashcard Trainer events
    document
      .getElementById("sp-card-flipper")
      ?.addEventListener("click", () => flipSidePanelCard());

    document.getElementById("sp-card-audio-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = panelState.deck[panelState.cardIndex];
      if (card) {
        window.quizzlerSound.speak(
          card.word,
          card.lang || window.quizzlerStorage.data.targetLang
        );
      }
    });

    document
      .getElementById("sp-rate-1")
      ?.addEventListener("click", () => rateSidePanelCard(1));
    document
      .getElementById("sp-rate-2")
      ?.addEventListener("click", () => rateSidePanelCard(2));
    document
      .getElementById("sp-rate-3")
      ?.addEventListener("click", () => rateSidePanelCard(3));

    document.getElementById("sp-card-prev")?.addEventListener("click", () => {
      if (panelState.deck.length === 0) return;
      panelState.cardIndex =
        (panelState.cardIndex - 1 + panelState.deck.length) % panelState.deck.length;
      renderFlashcard();
    });

    document.getElementById("sp-card-next")?.addEventListener("click", () => {
      if (panelState.deck.length === 0) return;
      panelState.cardIndex = (panelState.cardIndex + 1) % panelState.deck.length;
      renderFlashcard();
    });

    document.getElementById("sp-btn-shuffle")?.addEventListener("click", () => {
      for (let i = panelState.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [panelState.deck[i], panelState.deck[j]] = [
          panelState.deck[j],
          panelState.deck[i]
        ];
      }
      panelState.cardIndex = 0;
      renderFlashcard();
      showToast("🔀 Deck shuffled!");
    });

    document.querySelectorAll(".sp-card-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadFlashcardDeck(btn.getAttribute("data-filter") || "all");
      });
    });

    // Keyboard shortcuts in Side Panel Flashcards tab
    window.addEventListener("keydown", (e) => {
      if (panelState.activeTab !== "flashcards") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        flipSidePanelCard();
      } else if (e.key === "1") {
        e.preventDefault();
        rateSidePanelCard(1);
      } else if (e.key === "2") {
        e.preventDefault();
        rateSidePanelCard(2);
      } else if (e.key === "3") {
        e.preventDefault();
        rateSidePanelCard(3);
      } else if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        const card = panelState.deck[panelState.cardIndex];
        if (card) {
          window.quizzlerSound.speak(
            card.word,
            card.lang || window.quizzlerStorage.data.targetLang
          );
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        document.getElementById("sp-card-prev")?.click();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        document.getElementById("sp-card-next")?.click();
      }
    });

    // Vault filter & JSON Export/Import
    document.getElementById("sp-vault-filter-input")?.addEventListener("input", () => {
      renderVaultTab();
    });

    document.getElementById("sp-btn-export")?.addEventListener("click", () => {
      const payload = {
        app: "Quizzler Web Immersion Extension",
        exportedAt: new Date().toISOString(),
        data: window.quizzlerStorage.data
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quizzler_web_vault_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("⬇️ Exported Flashcard Vault JSON!");
    });

    document.getElementById("sp-btn-import")?.addEventListener("click", () => {
      document.getElementById("sp-import-file")?.click();
    });

    document.getElementById("sp-import-file")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (parsed.data) {
            window.quizzlerStorage.mergeState(parsed.data);
            await window.quizzlerStorage.save();
            renderAll();
            showToast("✅ Imported Flashcard Vault backup!");
          }
        } catch (err) {
          showToast("⚠️ Invalid backup JSON file.");
        }
      };
      reader.readAsText(file);
    });
  }

  function showToast(msg) {
    const toast = document.getElementById("sp-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove("opacity-0");
    if (panelState.toastTimer) clearTimeout(panelState.toastTimer);
    panelState.toastTimer = setTimeout(() => {
      toast.classList.add("opacity-0");
    }, 2600);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
