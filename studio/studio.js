/**
 * Quizzler Full-Screen Studio Controller
 * Powers the full-tab 3D Spaced Repetition Flashcards Trainer, Vault Manager,
 * Custom Card Creator, and Custom Web Article / Text Immersion Reader.
 */

(function () {
  "use strict";

  const studioState = {
    mode: "cards", // 'cards' | 'reader'
    currentWord: null,
    deck: [],
    cardIndex: 0,
    isFlipped: false,
    filter: "all",
    readerLines: [], // [{ target, en, romaji, revealed }]
    userTranslations: {} // { [idx]: { text, score } }
  };

  const DEFAULT_SAMPLE_TEXTS = {
    fr: [
      {
        target: "On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux.",
        en: "One sees clearly only with the heart. What is essential is invisible to the eye."
      },
      {
        target: "C'est le temps que tu as perdu pour ta rose qui fait ta rose si importante.",
        en: "It is the time you have wasted for your rose that makes your rose so important."
      },
      {
        target: "Les hommes ont oublié cette vérité, dit le renard. Mais tu ne dois pas l'oublier.",
        en: "Men have forgotten this truth, said the fox. But you must not forget it."
      }
    ],
    ja: [
      {
        target: "ごんという名前の一人ぼっちの子ギツネが、森の中に住んでいました。",
        en: "A lonely little fox named Gon lived deep in the forest."
      },
      {
        target: "春になると、上野公園の桜が満開になって、たくさんの人がお花見を楽しみます。",
        en: "When spring arrives, the cherry blossoms in Ueno Park bloom fully and many people enjoy hanami."
      },
      {
        target: "露天風呂の温泉に入りながら、静かな夜の星を眺めました。",
        en: "While soaking in the open-air hot spring bath, I gazed at the quiet night stars."
      }
    ]
  };

  document.addEventListener("DOMContentLoaded", async () => {
    await window.quizzlerStorage.init();
    initDefaultStudioState();
    bindStudioEvents();
    renderStudioAll();

    window.quizzlerStorage.subscribe((data) => {
      if (data.selectedWord) {
        studioState.currentWord = data.selectedWord;
      }
      renderStudioAll();
    });
  });

  function initDefaultStudioState() {
    const lang = window.quizzlerStorage.data.targetLang;
    const cards = window.quizzlerStorage.getReviewCardsArray("all", lang);
    studioState.currentWord =
      window.quizzlerStorage.data.selectedWord ||
      cards[0] ||
      window.quizzlerStorage.lookupWordSync(lang === "ja" ? "狐" : "prince", lang);

    studioState.readerLines = (
      DEFAULT_SAMPLE_TEXTS[lang] || DEFAULT_SAMPLE_TEXTS.fr
    ).map((item) => ({ ...item, revealed: false }));

    loadStudioDeck("all");
  }

  function applyFuriganaRomajiBodyClasses() {
    const { furiganaMode, showRomaji } = window.quizzlerStorage.data;
    document.body.classList.remove("furigana-hover", "furigana-off");
    if (furiganaMode === "hover") document.body.classList.add("furigana-hover");
    else if (furiganaMode === "off") document.body.classList.add("furigana-off");

    document.body.classList.toggle("romaji-hidden", !showRomaji);
  }

  function renderStudioAll() {
    applyFuriganaRomajiBodyClasses();
    renderStudioHeader();
    renderStudioVaultSidebar();
    renderStudioInspector();
    if (studioState.mode === "cards") {
      renderStudioFlashcard();
    } else {
      renderStudioReader();
    }
  }

  function renderStudioHeader() {
    const { targetLang, immersionMode, furiganaMode, showRomaji, soundEnabled } =
      window.quizzlerStorage.data;
    const cfg = window.quizzlerStorage.getLangConfig(targetLang);

    const crest = document.getElementById("st-flag-crest");
    const badge = document.getElementById("st-lang-badge");
    const select = document.getElementById("st-lang-select");
    const jaBar = document.getElementById("st-ja-bar");
    const furiBtn = document.getElementById("st-btn-furigana");
    const romajiBtn = document.getElementById("st-btn-romaji");
    const immBtn = document.getElementById("st-btn-immersion");
    const soundBtn = document.getElementById("st-btn-sound");

    if (crest) crest.textContent = cfg.flag;
    if (badge) badge.textContent = cfg.badge;
    if (select && select.value !== targetLang) select.value = targetLang;
    if (jaBar) {
      jaBar.classList.toggle("hidden", targetLang !== "ja");
      jaBar.classList.toggle("flex", targetLang === "ja");
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
    }
    if (immBtn) {
      immBtn.textContent = immersionMode
        ? "👁️ Immersion: Hide Ref"
        : "👁️ Assisted: Show Ref";
    }
    if (soundBtn) soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
  }

  function renderStudioVaultSidebar() {
    const lang = window.quizzlerStorage.data.targetLang;
    const stats = window.quizzlerStorage.getVaultStats(lang);
    const sub = document.getElementById("st-vault-sub");
    if (sub) {
      sub.textContent = `${stats.total} cards • ${stats.mastered} mastered (${stats.pct}%)`;
    }

    const q = (document.getElementById("st-vault-search")?.value || "")
      .trim()
      .toLowerCase();
    const cards = window.quizzlerStorage
      .getReviewCardsArray("all", lang)
      .filter(
        (c) =>
          !q ||
          (c.word && c.word.toLowerCase().includes(q)) ||
          (c.en && c.en.toLowerCase().includes(q))
      );

    const listEl = document.getElementById("st-vault-list");
    if (!listEl) return;

    listEl.innerHTML = cards
      .map((c) => {
        const isMastered = (c.boxLevel || 1) >= 3;
        return `
        <div class="p-2.5 rounded-2xl bg-zinc-900/80 border ${
          isMastered ? "border-emerald-500/30" : "border-zinc-800"
        } flex items-center justify-between gap-2 hover:border-yellow-400/50 cursor-pointer transition" data-st-word="${encodeURIComponent(
          c.cleanWord || c.word
        )}">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-white truncate jp-font">${escapeHtml(
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
          <button class="st-del-card pro-btn w-6 h-6 rounded-lg text-[10px] text-zinc-400 hover:text-red-400" data-clean="${encodeURIComponent(
            c.cleanWord || c.word
          )}" title="Delete">✕</button>
        </div>
      `;
      })
      .join("");

    listEl.querySelectorAll("[data-st-word]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".st-del-card")) return;
        const clean = decodeURIComponent(row.getAttribute("data-st-word") || "");
        const card = window.quizzlerStorage.getReviewWord(clean, lang);
        if (card) {
          studioState.currentWord = card;
          window.quizzlerSound.speak(card.word, lang);
          renderStudioInspector();
        }
      });
    });

    listEl.querySelectorAll(".st-del-card").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const clean = decodeURIComponent(btn.getAttribute("data-clean") || "");
        await window.quizzlerStorage.toggleWordInReview({ cleanWord: clean }, lang);
        loadStudioDeck(studioState.filter);
        renderStudioAll();
      });
    });
  }

  function renderStudioInspector() {
    const meta = studioState.currentWord;
    if (!meta) return;
    const lang = meta.lang || window.quizzlerStorage.data.targetLang;

    const wordEl = document.getElementById("st-insp-word");
    const phonEl = document.getElementById("st-insp-phonetic");
    const posEl = document.getElementById("st-insp-pos");
    const enEl = document.getElementById("st-insp-en");
    const ctxTargetEl = document.getElementById("st-insp-ctx-target");
    const ctxEnEl = document.getElementById("st-insp-ctx-en");
    const extraEl = document.getElementById("st-insp-extra");
    const btnVault = document.getElementById("st-btn-toggle-vault");

    if (wordEl) wordEl.textContent = meta.word || meta.cleanWord || "";
    if (phonEl) {
      phonEl.textContent =
        lang === "ja"
          ? `${meta.kana || ""}${meta.romaji ? ` (${meta.romaji})` : ""}`
          : meta.ipa || "";
    }
    if (posEl) {
      posEl.textContent = `${meta.pos || "word"}${meta.jlpt ? ` • ${meta.jlpt}` : ""}`;
    }
    if (enEl) enEl.textContent = meta.en || "";

    const ctxTarget =
      meta.contextTarget ||
      meta.exampleTarget ||
      meta.exampleFr ||
      meta.exampleJa ||
      "";
    const ctxEn = meta.contextEn || meta.exampleEn || "";

    if (ctxTargetEl) ctxTargetEl.textContent = ctxTarget ? `« ${ctxTarget} »` : "";
    if (ctxEnEl) ctxEnEl.textContent = ctxEn ? `"${ctxEn}"` : "";

    if (extraEl) {
      if (lang === "ja" && Array.isArray(meta.kanji) && meta.kanji.length > 0) {
        extraEl.classList.remove("hidden");
        extraEl.innerHTML = meta.kanji
          .map(
            (k) => `
          <div class="kanji-breakdown-chip flex items-center justify-between cursor-pointer" data-kanji="${encodeURIComponent(
            k.char
          )}">
            <div class="flex items-center gap-2">
              <span class="text-lg font-bold text-yellow-400 jp-font">${escapeHtml(
                k.char
              )}</span>
              <div>
                <div class="text-xs font-bold text-white">${escapeHtml(
                  k.meaning || ""
                )}</div>
                <div class="text-[10px] font-mono text-zinc-400">On: ${escapeHtml(
                  k.on || "-"
                )} • Kun: ${escapeHtml(k.kun || "-")}</div>
              </div>
            </div>
            <span class="text-xs text-yellow-400">🔊</span>
          </div>
        `
          )
          .join("");
        extraEl.querySelectorAll("[data-kanji]").forEach((el) => {
          el.addEventListener("click", () => {
            window.quizzlerSound.speak(
              decodeURIComponent(el.getAttribute("data-kanji") || ""),
              "ja"
            );
          });
        });
      } else {
        extraEl.classList.add("hidden");
      }
    }

    const inVault = window.quizzlerStorage.isWordInReview(
      meta.cleanWord || meta.word,
      lang
    );
    if (btnVault) {
      btnVault.textContent = inVault
        ? "✓ In Flashcards Deck (Click to Remove)"
        : "⭐ + Add to Flashcards Deck";
      btnVault.className = inVault
        ? "pro-btn w-full py-2.5 rounded-2xl bg-zinc-800 text-emerald-300 border border-emerald-500/40 font-bold text-xs"
        : "pro-btn w-full py-2.5 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-zinc-950 font-bold text-xs";
    }
  }

  // ==========================================
  // 3D FLASHCARDS STUDIO
  // ==========================================

  function loadStudioDeck(filter = "all") {
    studioState.filter = filter;
    const lang = window.quizzlerStorage.data.targetLang;
    studioState.deck = window.quizzlerStorage.getReviewCardsArray(filter, lang);
    studioState.cardIndex = 0;
    studioState.isFlipped = false;

    document.querySelectorAll(".st-filter-btn").forEach((btn) => {
      const active = btn.getAttribute("data-filter") === filter;
      btn.className = active
        ? "st-filter-btn pro-btn px-3 py-1.5 rounded-xl text-xs font-bold bg-yellow-400/20 text-yellow-300 border-yellow-400/40"
        : "st-filter-btn pro-btn px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400";
    });

    renderStudioFlashcard();
  }

  function renderStudioFlashcard() {
    const flipper = document.getElementById("st-card-flipper");
    if (flipper) flipper.classList.remove("is-flipped");
    studioState.isFlipped = false;

    const card = studioState.deck[studioState.cardIndex];
    const progressEl = document.getElementById("st-card-progress");
    const barEl = document.getElementById("st-card-bar");

    if (!card) {
      if (progressEl) progressEl.textContent = "0 / 0";
      if (barEl) barEl.style.width = "0%";
      document.getElementById("st-card-front-word").textContent = "No Cards in Filter";
      document.getElementById("st-card-front-phonetic").textContent = "";
      document.getElementById("st-card-front-ctx").textContent =
        "Add words from any webpage or use '+ New Card' on the left!";
      return;
    }

    if (progressEl) {
      progressEl.textContent = `Card ${studioState.cardIndex + 1} / ${
        studioState.deck.length
      }`;
    }
    if (barEl) {
      barEl.style.width = `${Math.round(
        ((studioState.cardIndex + 1) / studioState.deck.length) * 100
      )}%`;
    }

    const lvl = card.boxLevel || 1;
    const levelEl = document.getElementById("st-card-level");
    if (levelEl) {
      levelEl.textContent =
        lvl >= 3
          ? "Level 3 • Mastered"
          : lvl === 2
          ? "Level 2 • In Review"
          : "Level 1 • Learning";
    }

    document.getElementById("st-card-front-word").textContent = card.word;
    document.getElementById("st-card-front-phonetic").textContent =
      card.lang === "ja"
        ? `${card.kana || ""}${card.romaji ? ` • ${card.romaji}` : ""}`
        : card.ipa || "";
    document.getElementById("st-card-front-pos").textContent = `${card.pos || "word"}${
      card.jlpt ? ` • ${card.jlpt}` : ""
    }`;

    const ctxTarget = card.exampleTarget || card.exampleFr || card.exampleJa || "";
    document.getElementById("st-card-front-ctx").textContent = ctxTarget
      ? `« ${ctxTarget} »`
      : `« ${card.word} »`;

    document.getElementById("st-card-back-word").textContent = card.word;
    document.getElementById("st-card-back-en").textContent = card.en;
    document.getElementById("st-card-back-sub").textContent =
      card.lang === "ja" ? `${card.kana || ""} (${card.romaji || ""})` : card.ipa || "";
    document.getElementById("st-card-back-ctx-target").textContent = ctxTarget
      ? `« ${ctxTarget} »`
      : "";
    document.getElementById("st-card-back-ctx-en").textContent = card.exampleEn
      ? `"${card.exampleEn}"`
      : "";
  }

  function flipStudioCard() {
    if (studioState.deck.length === 0) return;
    studioState.isFlipped = !studioState.isFlipped;
    window.quizzlerSound.playCardFlip();
    document
      .getElementById("st-card-flipper")
      ?.classList.toggle("is-flipped", studioState.isFlipped);
  }

  async function rateStudioCard(rating) {
    if (studioState.deck.length === 0) return;
    const card = studioState.deck[studioState.cardIndex];
    if (!card) return;

    await window.quizzlerStorage.updateCardRating(
      card.cleanWord || card.word,
      rating,
      card.lang || window.quizzlerStorage.data.targetLang
    );

    if (rating === 3) window.quizzlerSound.playCorrectChime();
    else if (rating === 2) window.quizzlerSound.playTone(540, 0.14, "triangle", 0.14);
    else {
      window.quizzlerSound.playErrorTone();
      studioState.deck.push(card);
    }

    if (studioState.cardIndex < studioState.deck.length - 1) {
      studioState.cardIndex++;
    } else {
      studioState.cardIndex = 0;
      window.quizzlerSound.playMasteryFanfare();
    }
    renderStudioAll();
  }

  // ==========================================
  // CUSTOM ARTICLE & WEB TEXT READER
  // ==========================================

  function tokenizeStudioLine(text, lang, ctxTarget, ctxEn, lineIdx) {
    if (lang === "ja") {
      const rubyHtml = window.quizzlerStorage.annotateJapaneseWithRuby(text);
      const tokenRegex =
        /(<ruby>.*?<\/ruby>)|([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)|([、。！？「」『』（）…・.,!?:;]+)|(\s+)/g;
      let match;
      let html = "";
      while ((match = tokenRegex.exec(rubyHtml)) !== null) {
        if (match[1]) {
          const base = match[1].replace(/<rt>.*?<\/rt>/g, "").replace(/<[^>]+>/g, "");
          const clean = window.quizzlerStorage.normalizeWordKey(base, "ja");
          const inRev = window.quizzlerStorage.isWordInReview(clean, "ja");
          html += `<span class="word-token ${
            inRev ? "in-review" : ""
          }" data-raw="${encodeURIComponent(base)}" data-ctx-target="${encodeURIComponent(
            ctxTarget
          )}" data-ctx-en="${encodeURIComponent(ctxEn)}">${match[1]}</span>`;
        } else if (match[2]) {
          const clean = window.quizzlerStorage.normalizeWordKey(match[2], "ja");
          const inRev = window.quizzlerStorage.isWordInReview(clean, "ja");
          html += `<span class="word-token ${
            inRev ? "in-review" : ""
          }" data-raw="${encodeURIComponent(
            match[2]
          )}" data-ctx-target="${encodeURIComponent(
            ctxTarget
          )}" data-ctx-en="${encodeURIComponent(ctxEn)}">${match[2]}</span>`;
        } else {
          html += match[3] || match[4] || "";
        }
      }
      return html;
    }

    const tokenRegex = /([a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ']+)|([^a-zA-ZÀ-ÿœŒæÆñÑßäöüÄÖÜ']+)/g;
    let match;
    let html = "";
    while ((match = tokenRegex.exec(text)) !== null) {
      if (match[1]) {
        const clean = window.quizzlerStorage.normalizeWordKey(match[1], lang);
        const inRev = window.quizzlerStorage.isWordInReview(clean, lang);
        html += `<span class="word-token ${
          inRev ? "in-review" : ""
        }" data-raw="${encodeURIComponent(
          match[1]
        )}" data-ctx-target="${encodeURIComponent(
          ctxTarget
        )}" data-ctx-en="${encodeURIComponent(ctxEn)}">${match[1]}</span>`;
      } else {
        html += match[2] || "";
      }
    }
    return html;
  }

  function renderStudioReader() {
    const container = document.getElementById("st-reader-sentences");
    if (!container) return;

    const lang = window.quizzlerStorage.data.targetLang;
    const immersionMode = window.quizzlerStorage.data.immersionMode;

    container.innerHTML = studioState.readerLines
      .map((line, idx) => {
        const tokenized = tokenizeStudioLine(
          line.target,
          lang,
          line.target,
          line.en || "",
          idx
        );
        const uData = studioState.userTranslations[idx] || { text: "", score: null };
        const showRef = !immersionMode || line.revealed;

        return `
        <div class="p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800 space-y-2.5">
          <div class="flex items-start justify-between gap-3">
            <div class="text-base sm:text-lg font-medium text-white leading-relaxed jp-font">
              ${tokenized}
            </div>
            <button class="st-speak-line pro-btn w-8 h-8 rounded-xl flex items-center justify-center text-yellow-400 shrink-0" data-text="${encodeURIComponent(
              line.target
            )}">🔊</button>
          </div>

          <textarea class="st-line-input user-trans-input w-full p-2.5 rounded-xl text-xs" data-idx="${idx}" placeholder="Type your English translation here...">${escapeHtml(
          uData.text
        )}</textarea>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <button class="st-reveal-line pro-btn px-3 py-1 rounded-xl text-xs font-semibold text-yellow-300" data-idx="${idx}">
              ${showRef ? "🙈 Hide Reference" : "👁️ Comparer avec la référence"}
            </button>
            <div class="star-rating-bar">
              ${[0, 1, 2, 3, 4]
                .map(
                  (s) => `
                <button class="star-btn star-${s} ${
                    uData.score === s ? "active" : ""
                  }" data-idx="${idx}" data-score="${s}">
                  ${s} ★
                </button>
              `
                )
                .join("")}
            </div>
          </div>

          <div class="${
            showRef ? "" : "hidden"
          } p-2.5 rounded-xl bg-zinc-950/90 border-l-4 border-emerald-400 text-xs text-zinc-200">
            <span class="text-[10px] font-mono uppercase text-emerald-400 block font-bold">Reference English Translation</span>
            ${escapeHtml(line.en || "Click to translate reference...")}
          </div>
        </div>
      `;
      })
      .join("");

    container.querySelectorAll(".word-token").forEach((tok) => {
      tok.addEventListener("click", async () => {
        const raw = decodeURIComponent(tok.getAttribute("data-raw") || "");
        const ctxT = decodeURIComponent(tok.getAttribute("data-ctx-target") || "");
        const ctxE = decodeURIComponent(tok.getAttribute("data-ctx-en") || "");
        window.quizzlerSound.speak(raw, lang);
        const meta = await window.quizzlerStorage.lookupWordWithLiveFallback(
          raw,
          lang,
          ctxT,
          ctxE
        );
        if (meta) {
          studioState.currentWord = meta;
          renderStudioInspector();
        }
      });
    });

    container.querySelectorAll(".st-speak-line").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.quizzlerSound.speak(
          decodeURIComponent(btn.getAttribute("data-text") || ""),
          lang
        );
      });
    });

    container.querySelectorAll(".st-line-input").forEach((ta) => {
      ta.addEventListener("input", () => {
        const i = Number(ta.getAttribute("data-idx"));
        if (!studioState.userTranslations[i]) {
          studioState.userTranslations[i] = { text: "", score: null };
        }
        studioState.userTranslations[i].text = ta.value;
      });
    });

    container.querySelectorAll(".st-reveal-line").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-idx"));
        studioState.readerLines[i].revealed = !studioState.readerLines[i].revealed;
        renderStudioReader();
      });
    });

    container.querySelectorAll(".star-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-idx"));
        const sc = Number(btn.getAttribute("data-score"));
        if (!studioState.userTranslations[i]) {
          studioState.userTranslations[i] = { text: "", score: sc };
        } else {
          studioState.userTranslations[i].score = sc;
        }
        window.quizzlerSound.playCorrectChime();
        renderStudioReader();
      });
    });
  }

  function bindStudioEvents() {
    document.getElementById("st-mode-cards")?.addEventListener("click", () => {
      studioState.mode = "cards";
      document
        .getElementById("st-mode-cards")
        .classList.replace("text-zinc-300", "bg-yellow-400");
      document.getElementById("st-mode-cards").classList.add("text-zinc-950");
      document
        .getElementById("st-mode-reader")
        .classList.remove("bg-yellow-400", "text-zinc-950");
      document.getElementById("st-surface-cards")?.classList.remove("hidden");
      document.getElementById("st-surface-reader")?.classList.add("hidden");
      renderStudioAll();
    });

    document.getElementById("st-mode-reader")?.addEventListener("click", () => {
      studioState.mode = "reader";
      document
        .getElementById("st-mode-reader")
        .classList.add("bg-yellow-400", "text-zinc-950");
      document
        .getElementById("st-mode-cards")
        .classList.remove("bg-yellow-400", "text-zinc-950");
      document.getElementById("st-surface-cards")?.classList.add("hidden");
      document.getElementById("st-surface-reader")?.classList.remove("hidden");
      renderStudioAll();
    });

    document.getElementById("st-lang-select")?.addEventListener("change", async (e) => {
      await window.quizzlerStorage.setTargetLang(e.target.value);
      initDefaultStudioState();
      renderStudioAll();
    });

    document.getElementById("st-btn-furigana")?.addEventListener("click", async () => {
      const order = ["always", "hover", "off"];
      const curr = window.quizzlerStorage.data.furiganaMode || "always";
      await window.quizzlerStorage.setFuriganaMode(
        order[(order.indexOf(curr) + 1) % order.length]
      );
      renderStudioAll();
    });

    document.getElementById("st-btn-romaji")?.addEventListener("click", async () => {
      await window.quizzlerStorage.toggleRomaji();
      renderStudioAll();
    });

    document.getElementById("st-btn-immersion")?.addEventListener("click", async () => {
      await window.quizzlerStorage.setImmersionMode(
        !window.quizzlerStorage.data.immersionMode
      );
      renderStudioAll();
    });

    document.getElementById("st-btn-sound")?.addEventListener("click", async () => {
      const en = window.quizzlerSound.toggleSound();
      window.quizzlerStorage.data.soundEnabled = en;
      await window.quizzlerStorage.save();
      renderStudioHeader();
    });

    // New Custom Card form
    document.getElementById("st-btn-new-card")?.addEventListener("click", () => {
      document.getElementById("st-new-card-form")?.classList.toggle("hidden");
    });

    document.getElementById("st-cancel-new-card")?.addEventListener("click", () => {
      document.getElementById("st-new-card-form")?.classList.add("hidden");
    });

    document.getElementById("st-save-new-card")?.addEventListener("click", async () => {
      const word = document.getElementById("st-new-word")?.value.trim();
      const en = document.getElementById("st-new-en")?.value.trim();
      const ctx = document.getElementById("st-new-ctx")?.value.trim();
      if (!word || !en) return;

      const lang = window.quizzlerStorage.data.targetLang;
      await window.quizzlerStorage.toggleWordInReview(
        {
          word,
          cleanWord: word,
          en,
          lang,
          contextTarget: ctx
        },
        lang
      );
      document.getElementById("st-new-card-form")?.classList.add("hidden");
      loadStudioDeck(studioState.filter);
      renderStudioAll();
    });

    document.getElementById("st-vault-search")?.addEventListener("input", () => {
      renderStudioVaultSidebar();
    });

    // Inspector
    document.getElementById("st-insp-audio")?.addEventListener("click", () => {
      if (studioState.currentWord) {
        window.quizzlerSound.speak(
          studioState.currentWord.word,
          studioState.currentWord.lang || window.quizzlerStorage.data.targetLang
        );
      }
    });

    document.getElementById("st-btn-toggle-vault")?.addEventListener("click", async () => {
      if (!studioState.currentWord) return;
      await window.quizzlerStorage.toggleWordInReview(studioState.currentWord);
      loadStudioDeck(studioState.filter);
      renderStudioAll();
    });

    // 3D Flashcards controls
    document
      .getElementById("st-card-flipper")
      ?.addEventListener("click", () => flipStudioCard());

    document.getElementById("st-card-audio")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = studioState.deck[studioState.cardIndex];
      if (card) {
        window.quizzlerSound.speak(
          card.word,
          card.lang || window.quizzlerStorage.data.targetLang
        );
      }
    });

    document.getElementById("st-rate-1")?.addEventListener("click", () => rateStudioCard(1));
    document.getElementById("st-rate-2")?.addEventListener("click", () => rateStudioCard(2));
    document.getElementById("st-rate-3")?.addEventListener("click", () => rateStudioCard(3));

    document.getElementById("st-card-prev")?.addEventListener("click", () => {
      if (studioState.deck.length === 0) return;
      studioState.cardIndex =
        (studioState.cardIndex - 1 + studioState.deck.length) % studioState.deck.length;
      renderStudioFlashcard();
    });

    document.getElementById("st-card-next")?.addEventListener("click", () => {
      if (studioState.deck.length === 0) return;
      studioState.cardIndex = (studioState.cardIndex + 1) % studioState.deck.length;
      renderStudioFlashcard();
    });

    document.getElementById("st-btn-shuffle")?.addEventListener("click", () => {
      for (let i = studioState.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [studioState.deck[i], studioState.deck[j]] = [
          studioState.deck[j],
          studioState.deck[i]
        ];
      }
      studioState.cardIndex = 0;
      renderStudioFlashcard();
    });

    document.querySelectorAll(".st-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadStudioDeck(btn.getAttribute("data-filter") || "all");
      });
    });

    // Custom Paste & Translate Reader
    document.getElementById("st-btn-toggle-paste")?.addEventListener("click", () => {
      document.getElementById("st-paste-box")?.classList.toggle("hidden");
    });

    document.getElementById("st-btn-tokenize-raw")?.addEventListener("click", async () => {
      const raw = document.getElementById("st-paste-input")?.value.trim();
      if (!raw) return;
      const lang = window.quizzlerStorage.data.targetLang;
      const lines = raw
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const resp = await chrome.runtime.sendMessage({
        type: "TRANSLATE_BATCH",
        texts: lines,
        sourceLang: lang,
        targetLang: "en"
      });
      const results = resp?.results || lines.map((l) => ({ translated: "" }));

      studioState.readerLines = lines.map((l, idx) => ({
        target: l,
        en: results[idx]?.translated || "",
        revealed: false
      }));
      studioState.userTranslations = {};
      renderStudioReader();
    });

    document
      .getElementById("st-btn-translate-raw")
      ?.addEventListener("click", async () => {
        const raw = document.getElementById("st-paste-input")?.value.trim();
        if (!raw) return;
        const lang = window.quizzlerStorage.data.targetLang;
        const lines = raw
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean);

        const resp = await chrome.runtime.sendMessage({
          type: "TRANSLATE_BATCH",
          texts: lines,
          sourceLang: "auto",
          targetLang: lang
        });
        const results = resp?.results || lines.map((l) => ({ translated: l }));

        studioState.readerLines = lines.map((orig, idx) => ({
          target: results[idx]?.translated || orig,
          en: orig,
          revealed: false
        }));
        studioState.userTranslations = {};
        renderStudioReader();
      });

    // Keyboard shortcuts for Studio Flashcards
    window.addEventListener("keydown", (e) => {
      if (studioState.mode !== "cards") return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        flipStudioCard();
      } else if (e.key === "1") {
        e.preventDefault();
        rateStudioCard(1);
      } else if (e.key === "2") {
        e.preventDefault();
        rateStudioCard(2);
      } else if (e.key === "3") {
        e.preventDefault();
        rateStudioCard(3);
      } else if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        const card = studioState.deck[studioState.cardIndex];
        if (card) {
          window.quizzlerSound.speak(
            card.word,
            card.lang || window.quizzlerStorage.data.targetLang
          );
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        document.getElementById("st-card-prev")?.click();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        document.getElementById("st-card-next")?.click();
      }
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
