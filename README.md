# Quizzler Web Immersion & Flashcard Studio (Chrome Extension)

A Manifest V3 Chrome Extension that brings the interactive dictionary, Kanji/Furigana breakdown, sentence-by-sentence self-assessment, and 3D tactile flashcard engine from your **Quizzler** app to **any website on the internet**.

---

## Quick Start: Loading in Chrome / Brave / Arc / Edge

1. Open your browser and navigate to `chrome://extensions`.
2. Toggle **Developer mode** ON in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select this folder: `/Users/renco/Documents/Code/translate-browser`.
5. Pin the **Quizzler** icon in your browser toolbar — clicking it opens the **Quizzler Side Panel** directly!

---

## Core Workflows & Features

### 1. Translate Any Webpage & Make Every Word Clickable (`🌐 Translate & Immerse`)
- Visit any article, blog, or webpage in English (or any language).
- Click **`🌐 Translate & Immerse`** in the bottom-right **Floating Quizzler Dock** on the page, in the **Side Panel**, via the right-click context menu, or with **`Alt+Shift+T`**.
- Every readable paragraph is translated into your selected learning language (**French 🇫🇷, Japanese 🇯🇵, Spanish 🇪🇸, German 🇩🇪, or Italian 🇮🇹**) while keeping the original English text hidden as a reference for self-testing.
- Every word becomes an interactive token (`.qz-word-token`):
  - **Yellow underline**: Word is currently in your Flashcard Review Vault.
  - **Green underline**: Word has reached Level 3 Mastery (`boxLevel >= 3`).
  - **Japanese Ruby Furigana**: Automatically annotates Kanji compounds and single Kanji with `<ruby>` Furigana (`Always` / `Hover Only` / `Off`) and optional Romaji sublines!

### 2. Visit Native Target-Language Websites (`🔍 Tokenize Native`)
- Already browsing a site in French (*Le Monde*, Wikipedia FR) or Japanese (*NHK Easy*, Yahoo Japan)?
- Click **`🔍 Tokenize Native`** (or press **`Alt+Shift+R`**) to turn all native text on the page into clickable Quizzler word tokens without altering the original language.

### 3. On-Page Floating Word & Kanji Inspector HUD
- **Click any word** (or **drag-select a multi-word phrase**) on the page:
  - Plays native pronunciation aloud (`fr-FR`, `ja-JP`, etc.).
  - Slides open the **Floating Quizzler Inspector HUD** on the right side of the page (and syncs simultaneously with the **Side Panel Inspector**).
  - Displays:
    - **French**: IPA phonetic transcription, Part of Speech, Grammatical Gender (`Masc.`/`Fem.`), English definition, and automatic **Idiom / Locution detection** (`detectPhrasesInSentence`).
    - **Japanese**: Kana reading (`【きつね】`), Hepburn Romaji, Part of Speech, JLPT level, and **Constituent Kanji Breakdown** (each character's radical/core meaning, On'yomi, Kun'yomi, and independent audio).
    - **Live Fallback**: Any word or phrase not in the local Quizzler dictionary is automatically looked up via the background Service Worker and cached locally.
    - **Custom Definition Editor**: Click `Edit` to save your own personalized translation.
    - **1-Click `+ Add to Flashcards Deck`**: Adds/removes the word with its sentence context and immediately updates word highlights across the webpage.

### 4. Inline Sentence Comparator & 0–4 Star Self-Assessment (`✍️ Compare`)
- Next to every tokenized paragraph on a webpage, click **`✍️ Compare`** to open an inline Quizzler Translation Workspace:
  - Type your own English translation (autosaved per webpage URL).
  - Click **`👁️ Reveal Reference Translation`** (strictly hidden in Immersion Mode until you click!).
  - Grade your recall using Quizzler's **0–4 Star Rubric** (`0★ No clue` to `4★ Flawless`).

### 5. 3D Tactile Flashcards Trainer (On-Page Modal, Side Panel & Full-Screen Studio)
- Practice your Review Vault anywhere:
  - **On the webpage**: Click **`🗂️ N`** in the bottom-right dock.
  - **Side-by-side**: Switch to the **`🗂️ 3D Cards`** tab in the Side Panel.
  - **Full-screen**: Click **`⛶ Studio`** in the Side Panel to open the full-tab **Quizzler Web Studio** (`studio/studio.html`), which also includes a **Custom Web Text & Article Reader** where you can paste any text.
- **Keyboard Shortcuts**:
  - `[Space]` : Flip 3D card
  - `[A]` : Replay native pronunciation audio
  - `[1]` : **Hard / Again** (resets to Box 1 and re-queues card)
  - `[2]` : **Good / Retained** (promotes card to Box 2 / 3)
  - `[3]` : **Easy / Mastered** (marks card as Level 3 Mastered with emerald badge)
  - `[← / →]` : Previous / Next card
