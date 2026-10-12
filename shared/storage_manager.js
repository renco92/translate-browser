/**
 * Quizzler Extension Unified State, Dictionary & Storage Manager
 * Synchronizes Review Vault flashcards, custom definitions, active language,
 * Japanese Furigana/Romaji settings, selected word inspector state, and
 * per-webpage self-assessment translations across Content Scripts, Side Panel, and Studio.
 */

const QUIZZLER_LANGUAGES = {
  fr: {
    code: "fr",
    name: "French",
    nativeName: "Français",
    flag: "🇫🇷",
    speechLocale: "fr-FR",
    badge: "FRENCH"
  },
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    flag: "🇯🇵",
    speechLocale: "ja-JP",
    badge: "JAPANESE"
  },
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    flag: "🇪🇸",
    speechLocale: "es-ES",
    badge: "SPANISH"
  },
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    flag: "🇩🇪",
    speechLocale: "de-DE",
    badge: "GERMAN"
  },
  it: {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    flag: "🇮🇹",
    speechLocale: "it-IT",
    badge: "ITALIAN"
  }
};

const STARTER_FRENCH_CARDS = {
  prince: {
    word: "le prince",
    cleanWord: "prince",
    en: "prince",
    pos: "noun",
    ipa: "pʁɛ̃s",
    gender: "m",
    lang: "fr",
    exampleTarget: "S'il vous plaît... dessine-moi un mouton !",
    exampleFr: "S'il vous plaît... dessine-moi un mouton !",
    exampleEn: "Please... draw me a sheep!",
    boxLevel: 1,
    repetitions: 0,
    addedAt: Date.now() - 5000
  },
  renard: {
    word: "le renard",
    cleanWord: "renard",
    en: "fox",
    pos: "noun",
    ipa: "ʁə.naʁ",
    gender: "m",
    lang: "fr",
    exampleTarget: "Je suis un renard. Viens jouer avec moi.",
    exampleFr: "Je suis un renard. Viens jouer avec moi.",
    exampleEn: "I am a fox. Come play with me.",
    boxLevel: 1,
    repetitions: 0,
    addedAt: Date.now() - 4000
  },
  coeur: {
    word: "le cœur",
    cleanWord: "coeur",
    en: "heart",
    pos: "noun",
    ipa: "kœʁ",
    gender: "m",
    lang: "fr",
    exampleTarget: "On ne voit bien qu'avec le cœur.",
    exampleFr: "On ne voit bien qu'avec le cœur.",
    exampleEn: "It is only with the heart that one can see rightly.",
    boxLevel: 1,
    repetitions: 0,
    addedAt: Date.now() - 3000
  },
  apprivoiser: {
    word: "apprivoiser",
    cleanWord: "apprivoiser",
    en: "to tame / to create ties",
    pos: "verb",
    ipa: "a.pʁi.vwa.ze",
    gender: "",
    lang: "fr",
    exampleTarget: "Ça signifie « créer des liens... »",
    exampleFr: "Ça signifie « créer des liens... »",
    exampleEn: "It means 'to create ties...'",
    boxLevel: 1,
    repetitions: 0,
    addedAt: Date.now() - 2000
  },
  essentiel: {
    word: "essentiel",
    cleanWord: "essentiel",
    en: "essential / vital",
    pos: "adjective",
    ipa: "e.sɑ̃.sjɛl",
    gender: "m",
    lang: "fr",
    exampleTarget: "L'essentiel est invisible pour les yeux.",
    exampleFr: "L'essentiel est invisible pour les yeux.",
    exampleEn: "What is essential is invisible to the eye.",
    boxLevel: 2,
    repetitions: 1,
    addedAt: Date.now() - 1000
  }
};

const STARTER_JAPANESE_CARDS = {
  狐: {
    word: "狐",
    cleanWord: "狐",
    kana: "きつね",
    romaji: "kitsune",
    en: "fox (folklore character)",
    pos: "名詞 (Noun)",
    jlpt: "N3",
    lang: "ja",
    kanji: [{ char: "狐", meaning: "fox", on: "コ", kun: "きつね" }],
    exampleTarget: "ごんという名前の一人ぼっちの子ギツネが住んでいました。",
    exampleJa: "ごんという名前の一人ぼっちの子ギツネが住んでいました。",
    exampleEn: "There lived a lonely little fox named Gon.",
    boxLevel: 1,
    repetitions: 0,
    addedAt: Date.now() - 5000
  },
  桃太郎: {
    word: "桃太郎",
    cleanWord: "桃太郎",
    kana: "ももたろう",
    romaji: "Momotarō",
    en: "Momotaro (Peach Boy)",
    pos: "固有名詞 (Proper Noun)",
    jlpt: "N4",
    lang: "ja",
    kanji: [
      { char: "桃", meaning: "peach", on: "トウ", kun: "もも" },
      { char: "太", meaning: "great", on: "タイ", kun: "ふと・い" },
      { char: "郎", meaning: "son", on: "ロウ", kun: "" }
    ],
    exampleTarget: "桃から生まれたので「桃太郎」と名付けられました。",
    exampleJa: "桃から生まれたので「桃太郎」と名付けられました。",
    exampleEn: "Because he was born from a peach, they named him Momotaro.",
    boxLevel: 1,
    repetitions: 0,
    addedAt: Date.now() - 4000
  },
  桜: {
    word: "桜",
    cleanWord: "桜",
    kana: "さくら",
    romaji: "sakura",
    en: "cherry blossom / sakura",
    pos: "名詞 (Noun)",
    jlpt: "N4",
    lang: "ja",
    kanji: [{ char: "桜", meaning: "cherry blossom", on: "オウ", kun: "さくら" }],
    exampleTarget: "上野公園の桜が満開だね！",
    exampleJa: "上野公園の桜が満開だね！",
    exampleEn: "The cherry blossoms in Ueno Park are in full bloom!",
    boxLevel: 1,
    repetitions: 0,
    addedAt: Date.now() - 3000
  },
  昔々: {
    word: "昔々",
    cleanWord: "昔々",
    kana: "むかしむかし",
    romaji: "mukashi-mukashi",
    en: "once upon a time",
    pos: "副詞 (Adverb)",
    jlpt: "N5",
    lang: "ja",
    kanji: [{ char: "昔", meaning: "ancient times", on: "セキ", kun: "むかし" }],
    exampleTarget: "昔々、ある所におじいさんとおばあさんが住んでいました。",
    exampleJa: "昔々、ある所におじいさんとおばあさんが住んでいました。",
    exampleEn: "Once upon a time, long ago, an old man and woman lived together.",
    boxLevel: 1,
    repetitions: 0,
    addedAt: Date.now() - 2000
  },
  温泉: {
    word: "温泉",
    cleanWord: "温泉",
    kana: "おんせん",
    romaji: "onsen",
    en: "hot spring / spa",
    pos: "名詞 (Noun)",
    jlpt: "N4",
    lang: "ja",
    kanji: [
      { char: "温", meaning: "warm", on: "オン", kun: "あたた・かい" },
      { char: "泉", meaning: "spring / fountain", on: "セン", kun: "いずみ" }
    ],
    exampleTarget: "露天風呂の温泉はとても気持ちいいですね。",
    exampleJa: "露天風呂の温泉はとても気持ちいいですね。",
    exampleEn: "The open-air hot spring bath feels wonderful.",
    boxLevel: 2,
    repetitions: 1,
    addedAt: Date.now() - 1000
  }
};

class QuizzlerStorageManager {
  constructor() {
    this.storageKey = "quizzler_ext_state_v1";
    this.listeners = new Set();
    this.readyPromise = null;

    this.data = {
      targetLang: "fr", // 'fr', 'ja', 'es', 'de', 'it'
      immersionMode: true, // true = reference translations hidden until clicked
      furiganaMode: "always", // 'always' | 'hover' | 'off'
      showRomaji: false,
      showFloatingBar: true,
      soundEnabled: true,
      selectedWord: null,
      vaults: {
        fr: { ...STARTER_FRENCH_CARDS },
        ja: { ...STARTER_JAPANESE_CARDS },
        es: {},
        de: {},
        it: {}
      },
      customDefinitions: {
        fr: {},
        ja: {},
        es: {},
        de: {},
        it: {}
      },
      liveWordCache: {
        fr: {},
        ja: {},
        es: {},
        de: {},
        it: {}
      },
      pageTranslations: {}, // { [urlKey]: { [blockIdx]: { text: string, score: number|null, revealed: boolean } } }
      customArticles: [], // Saved custom texts in Studio
      stats: {
        wordsInspected: 0,
        cardsReviewedToday: 0,
        pagesTranslated: 0
      }
    };

    this.init();
  }

  async init() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          const res = await chrome.storage.local.get(this.storageKey);
          if (res && res[this.storageKey]) {
            const saved = res[this.storageKey];
            this.mergeState(saved);
          } else {
            await this.save();
          }

          chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes[this.storageKey]?.newValue) {
              this.mergeState(changes[this.storageKey].newValue);
              this.notifyListeners();
            }
          });
        }
      } catch (e) {
        console.warn("Quizzler storage init error:", e);
      }
      this.notifyListeners();
      return this.data;
    })();
    return this.readyPromise;
  }

  mergeState(saved) {
    if (!saved || typeof saved !== "object") return;
    if (saved.targetLang) this.data.targetLang = saved.targetLang;
    if (saved.immersionMode !== undefined) this.data.immersionMode = saved.immersionMode;
    if (saved.furiganaMode) this.data.furiganaMode = saved.furiganaMode;
    if (saved.showRomaji !== undefined) this.data.showRomaji = saved.showRomaji;
    if (saved.showFloatingBar !== undefined) this.data.showFloatingBar = saved.showFloatingBar;
    if (saved.soundEnabled !== undefined) {
      this.data.soundEnabled = saved.soundEnabled;
      if (window.quizzlerSound) window.quizzlerSound.soundEnabled = saved.soundEnabled;
    }
    if (saved.selectedWord !== undefined) this.data.selectedWord = saved.selectedWord;
    if (saved.vaults) {
      this.data.vaults = { ...this.data.vaults, ...saved.vaults };
    }
    if (saved.customDefinitions) {
      this.data.customDefinitions = { ...this.data.customDefinitions, ...saved.customDefinitions };
    }
    if (saved.liveWordCache) {
      this.data.liveWordCache = { ...this.data.liveWordCache, ...saved.liveWordCache };
    }
    if (saved.pageTranslations) {
      this.data.pageTranslations = saved.pageTranslations;
    }
    if (saved.customArticles) {
      this.data.customArticles = saved.customArticles;
    }
    if (saved.stats) {
      this.data.stats = { ...this.data.stats, ...saved.stats };
    }
  }

  async save() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [this.storageKey]: this.data });
      }
    } catch (e) {
      console.warn("Quizzler storage save error:", e);
    }
    this.notifyListeners();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.data);
      } catch (e) {
        console.error("Listener error:", e);
      }
    });
  }

  getLangConfig(lang = this.data.targetLang) {
    return QUIZZLER_LANGUAGES[lang] || QUIZZLER_LANGUAGES.fr;
  }

  async setTargetLang(lang) {
    if (QUIZZLER_LANGUAGES[lang]) {
      this.data.targetLang = lang;
      await this.save();
    }
  }

  async setImmersionMode(enabled) {
    this.data.immersionMode = Boolean(enabled);
    await this.save();
  }

  async setFuriganaMode(mode) {
    if (["always", "hover", "off"].includes(mode)) {
      this.data.furiganaMode = mode;
      await this.save();
    }
  }

  async toggleRomaji() {
    this.data.showRomaji = !this.data.showRomaji;
    await this.save();
    return this.data.showRomaji;
  }

  async setSelectedWord(wordMeta) {
    this.data.selectedWord = wordMeta;
    this.data.stats.wordsInspected = (this.data.stats.wordsInspected || 0) + 1;
    await this.save();
  }

  // ==========================================
  // NORMALIZATION & DICTIONARY LOOKUP
  // ==========================================

  normalizeWordKey(rawWord, lang = this.data.targetLang) {
    if (!rawWord) return "";
    const trimmed = String(rawWord).trim();
    if (lang === "ja") {
      return window.normalizeJapaneseWord
        ? window.normalizeJapaneseWord(trimmed)
        : trimmed.replace(/[、。！？「」『』（）…・\s]/g, "");
    }
    if (window.stripAccents && window.normalizeFrenchWord) {
      return window.stripAccents(window.normalizeFrenchWord(trimmed));
    }
    return trimmed
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,\/#!$%\^&\*;:{}=\-_~`()?"«»'’]/g, "")
      .trim();
  }

  /**
   * Synchronous local lookup using Quizzler's comprehensive French & Japanese DBs
   * plus cached live lookups.
   */
  lookupWordSync(rawWord, lang = this.data.targetLang) {
    if (!rawWord) return null;
    const cleanKey = this.normalizeWordKey(rawWord, lang);
    if (!cleanKey) return null;

    const customDef = this.getCustomDefinition(cleanKey, lang);
    const cachedLive = this.data.liveWordCache[lang]?.[cleanKey];

    if (lang === "fr" && window.lookupFrenchWord) {
      const frRes = window.lookupFrenchWord(rawWord);
      const isFallback =
        !frRes ||
        frRes.en.startsWith("French word:") ||
        frRes.en.startsWith("vocabulary word");
      const finalEn =
        customDef ||
        (cachedLive && isFallback ? cachedLive.en : frRes.en);
      return {
        ...frRes,
        lang: "fr",
        word: rawWord.trim(),
        cleanWord: frRes.cleanWord || cleanKey,
        originalEn: cachedLive?.en || frRes.en,
        en: finalEn,
        isCustom: Boolean(customDef),
        needsLiveLookup: isFallback && !cachedLive && !customDef
      };
    }

    if (lang === "ja" && window.lookupJapaneseWord) {
      const jaRes = window.lookupJapaneseWord(rawWord);
      const isFallback =
        !jaRes ||
        jaRes.en.startsWith("Japanese expression:") ||
        jaRes.en.startsWith("Compound word composed of:");
      const finalEn =
        customDef ||
        (cachedLive && isFallback ? cachedLive.en : jaRes.en);
      return {
        ...jaRes,
        lang: "ja",
        word: jaRes.word || rawWord.trim(),
        cleanWord: jaRes.cleanWord || cleanKey,
        kana: cachedLive?.kana || jaRes.kana || cleanKey,
        romaji: cachedLive?.romaji || jaRes.romaji || "",
        originalEn: cachedLive?.en || jaRes.en,
        en: finalEn,
        isCustom: Boolean(customDef),
        needsLiveLookup: isFallback && !cachedLive && !customDef
      };
    }

    // Other languages or fallback
    return {
      lang,
      word: rawWord.trim(),
      cleanWord: cleanKey,
      ipa: cachedLive?.ipa || `/${cleanKey}/`,
      pos: cachedLive?.pos || "word",
      gender: cachedLive?.gender || "",
      originalEn: cachedLive?.en || `Translating "${rawWord.trim()}"...`,
      en: customDef || cachedLive?.en || `Translating "${rawWord.trim()}"...`,
      isCustom: Boolean(customDef),
      needsLiveLookup: !cachedLive && !customDef
    };
  }

  /**
   * Async lookup that enriches unknown words on any webpage using the Service Worker's
   * live translation & dictionary fallback endpoint.
   */
  async lookupWordWithLiveFallback(
    rawWord,
    lang = this.data.targetLang,
    contextTarget = "",
    contextEn = ""
  ) {
    const base = this.lookupWordSync(rawWord, lang);
    if (!base) return null;

    base.contextTarget = contextTarget;
    base.contextFr = lang === "fr" ? contextTarget : "";
    base.contextJa = lang === "ja" ? contextTarget : "";
    base.contextEn = contextEn;

    if (!base.needsLiveLookup) {
      return base;
    }

    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        const resp = await chrome.runtime.sendMessage({
          type: "LOOKUP_LIVE_WORD",
          word: rawWord.trim(),
          lang
        });
        if (resp && resp.en) {
          const cleanKey = this.normalizeWordKey(base.cleanWord || rawWord, lang);
          if (!this.data.liveWordCache[lang]) this.data.liveWordCache[lang] = {};
          this.data.liveWordCache[lang][cleanKey] = {
            en: resp.en,
            pos: resp.pos || base.pos,
            ipa: resp.ipa || base.ipa,
            kana: resp.kana || base.kana,
            romaji: resp.romaji || base.romaji
          };
          await this.save();

          if (!base.isCustom) {
            base.en = resp.en;
            base.originalEn = resp.en;
          }
          if (resp.pos && (!base.pos || base.pos === "word" || base.pos.includes("Expression"))) {
            base.pos = resp.pos;
          }
          base.needsLiveLookup = false;
        }
      }
    } catch (e) {
      // Service worker fallback unavailable
    }

    return base;
  }

  async lookupPhraseWithLiveFallback(
    rawPhrase,
    lang = this.data.targetLang,
    contextTarget = "",
    contextEn = ""
  ) {
    if (!rawPhrase) return null;
    const cleanKey = this.normalizeWordKey(rawPhrase, lang);
    const customDef = this.getCustomDefinition(cleanKey, lang);

    let base = null;
    if (lang === "fr" && window.lookupFrenchPhrase) {
      base = window.lookupFrenchPhrase(rawPhrase);
    } else if (lang === "ja" && window.lookupJapanesePhrase) {
      base = window.lookupJapanesePhrase(rawPhrase);
    } else {
      base = {
        word: rawPhrase.trim(),
        cleanWord: cleanKey,
        en: customDef || `Translating "${rawPhrase.trim()}"...`,
        pos: "Phrase / Expression",
        ipa: `/${cleanKey}/`,
        isPhrase: true
      };
    }

    base.lang = lang;
    base.isPhrase = true;
    base.contextTarget = contextTarget;
    base.contextFr = lang === "fr" ? contextTarget : "";
    base.contextJa = lang === "ja" ? contextTarget : "";
    base.contextEn = contextEn;
    if (customDef) {
      base.en = customDef;
      base.isCustom = true;
    }

    // Check if phrase needs live translation (e.g. constituent fallback with '•' or generic Japanese phrase)
    const needsLive =
      !customDef &&
      (base.en.includes(" • ") ||
        base.en.startsWith("Japanese phrase") ||
        base.en.startsWith("Translating"));

    if (needsLive && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: "LOOKUP_LIVE_WORD",
          word: rawPhrase.trim(),
          lang
        });
        if (resp && resp.en) {
          base.en = resp.en;
          base.originalEn = resp.en;
        }
      } catch (e) {}
    }

    return base;
  }

  /**
   * Annotates plain Japanese text with <ruby>Kanji<rt>furigana</rt></ruby>
   * using Quizzler's JAPANESE_VOCAB_DB and JAPANESE_KANJI_DB.
   */
  annotateJapaneseWithRuby(text) {
    if (!text || typeof text !== "string") return "";
    if (text.includes("<ruby>")) return text;

    let result = text;
    if (window.JAPANESE_VOCAB_DB) {
      // Sort Kanji dictionary entries longest first so compound words match before single Kanji
      if (!this._sortedJaKanjiEntries) {
        this._sortedJaKanjiEntries = Object.entries(window.JAPANESE_VOCAB_DB)
          .filter(([k, v]) => /[一-龯々]/.test(k) && v.kana && k !== v.kana)
          .sort((a, b) => b[0].length - a[0].length);
      }

      // Replace compounds with placeholders first so nested Kanji aren't double-wrapped
      const placeholders = [];
      for (const [word, entry] of this._sortedJaKanjiEntries) {
        if (result.includes(word)) {
          const idx = placeholders.length;
          placeholders.push(`<ruby>${word}<rt>${entry.kana}</rt></ruby>`);
          result = result.split(word).join(`\u0000RUBY_${idx}\u0000`);
        }
      }

      // Annotate any remaining standalone Kanji from JAPANESE_KANJI_DB
      if (window.JAPANESE_KANJI_DB) {
        result = result.replace(/[一-龯]/g, (ch) => {
          const kInfo = window.JAPANESE_KANJI_DB[ch];
          if (kInfo) {
            const reading = (kInfo.kun || kInfo.on || "")
              .split(/[,、・]/)[0]
              .replace(/\s+/g, "");
            if (reading) {
              return `<ruby>${ch}<rt>${reading}</rt></ruby>`;
            }
          }
          return ch;
        });
      }

      // Restore compound placeholders
      result = result.replace(/\u0000RUBY_(\d+)\u0000/g, (_, i) => placeholders[Number(i)]);
    }

    return result;
  }

  // ==========================================
  // REVIEW VAULT & 3D FLASHCARDS CRUD
  // ==========================================

  getVault(lang = this.data.targetLang) {
    if (!this.data.vaults[lang]) {
      this.data.vaults[lang] = {};
    }
    return this.data.vaults[lang];
  }

  isWordInReview(cleanWord, lang = this.data.targetLang) {
    if (!cleanWord) return false;
    const key = this.normalizeWordKey(cleanWord, lang);
    return Boolean(this.getVault(lang)[key]);
  }

  getReviewWord(cleanWord, lang = this.data.targetLang) {
    if (!cleanWord) return null;
    const key = this.normalizeWordKey(cleanWord, lang);
    return this.getVault(lang)[key] || null;
  }

  async toggleWordInReview(wordMeta, lang = wordMeta?.lang || this.data.targetLang) {
    if (!wordMeta) return false;
    const rawKey = wordMeta.cleanWord || wordMeta.word;
    const key = this.normalizeWordKey(rawKey, lang);
    if (!key) return false;

    const vault = this.getVault(lang);
    if (vault[key]) {
      delete vault[key];
      await this.save();
      return false; // Removed
    } else {
      const customDef = this.getCustomDefinition(key, lang);
      const finalEn = customDef || wordMeta.en || "vocabulary word";
      const ctxTarget =
        wordMeta.contextTarget ||
        wordMeta.contextFr ||
        wordMeta.contextJa ||
        wordMeta.exampleTarget ||
        "";
      const ctxEn = wordMeta.contextEn || wordMeta.exampleEn || "";

      vault[key] = {
        word: wordMeta.word || key,
        cleanWord: key,
        lang,
        en: finalEn,
        isCustom: Boolean(customDef),
        pos: wordMeta.pos || "word",
        ipa: wordMeta.ipa || "",
        kana: wordMeta.kana || "",
        romaji: wordMeta.romaji || "",
        jlpt: wordMeta.jlpt || "",
        gender: wordMeta.gender || "",
        kanji: wordMeta.kanji || [],
        isPhrase: Boolean(wordMeta.isPhrase),
        exampleTarget: ctxTarget,
        exampleFr: lang === "fr" ? ctxTarget : "",
        exampleJa: lang === "ja" ? ctxTarget : "",
        exampleEn: ctxEn,
        boxLevel: 1,
        repetitions: 0,
        addedAt: Date.now(),
        lastReviewed: null
      };
      await this.save();
      return true; // Added
    }
  }

  async updateCardRating(cleanWord, rating, lang = this.data.targetLang) {
    const key = this.normalizeWordKey(cleanWord, lang);
    const vault = this.getVault(lang);
    const card = vault[key];
    if (!card) return;

    card.repetitions = (card.repetitions || 0) + 1;
    card.lastReviewed = Date.now();

    if (rating === 1) {
      card.boxLevel = 1;
    } else if (rating === 2) {
      card.boxLevel = Math.min(3, (card.boxLevel || 1) + 1);
    } else if (rating === 3) {
      card.boxLevel = 3;
    }

    this.data.stats.cardsReviewedToday = (this.data.stats.cardsReviewedToday || 0) + 1;
    await this.save();
  }

  getReviewCardsArray(filter = "all", lang = this.data.targetLang) {
    const vault = this.getVault(lang);
    let cards = Object.values(vault);
    if (filter === "learning") {
      cards = cards.filter((c) => (c.boxLevel || 1) < 3);
    } else if (filter === "mastered") {
      cards = cards.filter((c) => (c.boxLevel || 1) >= 3);
    }
    return cards.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }

  getVaultStats(lang = this.data.targetLang) {
    const cards = Object.values(this.getVault(lang));
    const total = cards.length;
    const mastered = cards.filter((c) => (c.boxLevel || 1) >= 3).length;
    const learning = total - mastered;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return { total, mastered, learning, pct };
  }

  getCustomDefinition(cleanWord, lang = this.data.targetLang) {
    if (!cleanWord) return null;
    const key = this.normalizeWordKey(cleanWord, lang);
    return this.data.customDefinitions[lang]?.[key] || null;
  }

  async setCustomDefinition(cleanWord, definition, lang = this.data.targetLang) {
    if (!cleanWord || !definition) return false;
    const key = this.normalizeWordKey(cleanWord, lang);
    const trimmed = definition.trim();
    if (!this.data.customDefinitions[lang]) {
      this.data.customDefinitions[lang] = {};
    }
    this.data.customDefinitions[lang][key] = trimmed;

    const vault = this.getVault(lang);
    if (vault[key]) {
      vault[key].en = trimmed;
      vault[key].isCustom = true;
    }

    if (this.data.selectedWord) {
      const selKey = this.normalizeWordKey(
        this.data.selectedWord.cleanWord || this.data.selectedWord.word,
        lang
      );
      if (selKey === key) {
        this.data.selectedWord.en = trimmed;
        this.data.selectedWord.isCustom = true;
      }
    }

    await this.save();
    return true;
  }

  async resetCustomDefinition(cleanWord, defaultEn = "", lang = this.data.targetLang) {
    if (!cleanWord) return false;
    const key = this.normalizeWordKey(cleanWord, lang);
    if (this.data.customDefinitions[lang]) {
      delete this.data.customDefinitions[lang][key];
    }

    const baseLookup = this.lookupWordSync(cleanWord, lang);
    const fallback = defaultEn || baseLookup?.originalEn || baseLookup?.en || "";

    const vault = this.getVault(lang);
    if (vault[key] && fallback) {
      vault[key].en = fallback;
      vault[key].isCustom = false;
    }

    if (this.data.selectedWord) {
      const selKey = this.normalizeWordKey(
        this.data.selectedWord.cleanWord || this.data.selectedWord.word,
        lang
      );
      if (selKey === key) {
        this.data.selectedWord.en = fallback;
        this.data.selectedWord.isCustom = false;
      }
    }

    await this.save();
    return true;
  }

  // ==========================================
  // PER-WEBPAGE ACTIVE TRANSLATIONS & 0-4 STARS
  // ==========================================

  getPageKey(url = window.location.href) {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`;
    } catch (e) {
      return url || "default_page";
    }
  }

  getPageBlockData(pageKey, blockIdx) {
    return (
      this.data.pageTranslations[pageKey]?.[blockIdx] || {
        text: "",
        score: null,
        revealed: false
      }
    );
  }

  async savePageBlockTranslation(pageKey, blockIdx, text) {
    if (!this.data.pageTranslations[pageKey]) {
      this.data.pageTranslations[pageKey] = {};
    }
    const prev = this.data.pageTranslations[pageKey][blockIdx] || {
      text: "",
      score: null,
      revealed: false
    };
    this.data.pageTranslations[pageKey][blockIdx] = {
      ...prev,
      text,
      updatedAt: Date.now()
    };
    await this.save();
  }

  async savePageBlockScore(pageKey, blockIdx, score) {
    if (!this.data.pageTranslations[pageKey]) {
      this.data.pageTranslations[pageKey] = {};
    }
    const prev = this.data.pageTranslations[pageKey][blockIdx] || {
      text: "",
      score: null,
      revealed: false
    };
    this.data.pageTranslations[pageKey][blockIdx] = {
      ...prev,
      score: Math.max(0, Math.min(4, Math.round(score))),
      updatedAt: Date.now()
    };
    await this.save();
  }
}

window.QUIZZLER_LANGUAGES = QUIZZLER_LANGUAGES;
window.quizzlerStorage = new QuizzlerStorageManager();
