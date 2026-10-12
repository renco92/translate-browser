/**
 * Quizzler Unified Sound & Multi-Language Speech Synthesis Engine
 * Combines procedural Web Audio API sound effects (card flip, chimes, fanfare)
 * with native browser SpeechSynthesis across French, Japanese, and other languages.
 */

class QuizzlerSoundEngine {
  constructor() {
    this.ctx = null;
    this.soundEnabled = true;
    this.voices = [];
    this.initSpeech();
  }

  initAudio() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  initSpeech() {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      this.voices = window.speechSynthesis.getVoices() || [];
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  getBestVoice(langCode) {
    if (!this.voices || this.voices.length === 0) {
      if ("speechSynthesis" in window) {
        this.voices = window.speechSynthesis.getVoices() || [];
      }
    }
    const prefix = (langCode || "fr").split("-")[0].toLowerCase();

    if (prefix === "fr") {
      return (
        this.voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith("fr") &&
            (v.name.toLowerCase().includes("thomas") ||
              v.name.toLowerCase().includes("amelie") ||
              v.name.toLowerCase().includes("audrey") ||
              v.lang.includes("FR"))
        ) ||
        this.voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ||
        null
      );
    }

    if (prefix === "ja") {
      return (
        this.voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith("ja") &&
            (v.name.includes("Kyoko") ||
              v.name.includes("Otoya") ||
              v.name.includes("Nanami") ||
              v.lang.includes("JP"))
        ) ||
        this.voices.find((v) => v.lang.toLowerCase().startsWith("ja")) ||
        null
      );
    }

    return (
      this.voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) || null
    );
  }

  playTone(freq, duration = 0.2, type = "sine", gainVal = 0.14) {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.ctx.currentTime + duration
      );

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Ignore audio autoplay errors before user gesture
    }
  }

  playCorrectChime() {
    this.playTone(523.25, 0.22, "triangle", 0.15); // C5
    setTimeout(() => this.playTone(659.25, 0.25, "triangle", 0.15), 70); // E5
    setTimeout(() => this.playTone(783.99, 0.35, "sine", 0.18), 140); // G5
  }

  playCardFlip() {
    this.playTone(320, 0.08, "sine", 0.1);
    setTimeout(() => this.playTone(480, 0.1, "triangle", 0.12), 40);
  }

  playErrorTone() {
    this.playTone(180, 0.18, "sawtooth", 0.11);
    setTimeout(() => this.playTone(140, 0.22, "sawtooth", 0.09), 90);
  }

  playHintChime() {
    this.playTone(440, 0.2, "sine", 0.12);
    setTimeout(() => this.playTone(880, 0.3, "triangle", 0.14), 100);
  }

  playMasteryFanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => this.playTone(freq, 0.35, "triangle", 0.16), idx * 80);
    });
  }

  speak(text, lang = "fr", rate = 0.92) {
    if (!("speechSynthesis" in window) || !this.soundEnabled || !text) return;
    try {
      window.speechSynthesis.cancel();
      const clean = String(text)
        .replace(/<rt>[^<]*<\/rt>/g, "")
        .replace(/<[^>]*>/g, "")
        .replace(/[*_#\[\]()«»「」『』]/g, "")
        .trim();
      if (!clean) return;

      const localeMap = {
        fr: "fr-FR",
        ja: "ja-JP",
        es: "es-ES",
        de: "de-DE",
        it: "it-IT",
        pt: "pt-BR",
        ko: "ko-KR",
        zh: "zh-CN"
      };
      const bcp47 = localeMap[lang] || lang || "fr-FR";

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = bcp47;
      utterance.rate = rate;
      utterance.pitch = 1.0;

      const voice = this.getBestVoice(bcp47);
      if (voice) {
        utterance.voice = voice;
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
    }
  }

  speakFrench(text, rate = 0.92) {
    this.speak(text, "fr", rate);
  }

  speakJapanese(text, rate = 0.92) {
    this.speak(text, "ja", rate);
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    if (!this.soundEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    return this.soundEnabled;
  }
}

window.quizzlerSound = new QuizzlerSoundEngine();
window.soundEngine = window.quizzlerSound;
