# Chrome Web Store Listing — Quizzler Web Immersion & Flashcard Studio

> Last Updated: 2026-10-11

## Store Listing

**Extension Name**
Quizzler Web Immersion & Flashcard Studio

**Short Description**
Translate webpages into the language you're learning, click words for audio/IPA/Kanji breakdown, and practice 3D spaced-repetition flashcards.

**Detailed Description**
Quizzler Web Immersion & Flashcard Studio transforms any webpage into an active language-learning workspace with interactive dictionaries and 3D spaced-repetition index cards.

Key Features:
Translate any webpage into French, Japanese, Spanish, German, or Italian while preserving the original text as a hidden reference translation for active recall.
Click any word or highlight any phrase on a webpage to hear native pronunciation, view phonetic transcriptions (IPA for French, Furigana & Romaji for Japanese), and see character-by-character Kanji breakdowns or idiom explanations.
Practice sentence-by-sentence comprehension directly on articles with Immersion Mode (click-to-reveal reference translations) and a 0-to-4 star self-assessment rubric.
Save vocabulary and expressions with one click to your Review Vault and practice active recall with 3D flip flashcards in the Side Panel, on-page modal, or full-screen Studio tab.

How to Use:
1. Click the extension icon to open the Quizzler Side Panel, or use the floating dock in the bottom-right corner of any webpage.
2. Select your target language and click "Translate & Immerse" (or "Tokenize Native" when visiting a foreign-language website).
3. Click any word to inspect its definition, hear native speech, and add it to your 3D flashcard deck.
4. Practice your saved flashcards anytime using keyboard shortcuts ([Space] to flip, [1]/[2]/[3] to rate recall, [A] to replay audio).

Privacy & Permissions:
All flashcards, custom definitions, and self-translations are stored locally on your device. Webpage text is only sent for translation when you explicitly trigger page translation or look up an unknown word.

**Category**
Productivity

**Single Purpose**
Translates and tokenizes webpages for interactive language learning with an integrated dictionary inspector and 3D spaced-repetition flashcards.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 | 1280×800 | ⬜ Not created | |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves the user's flashcard Review Vault, custom definitions, language preferences, and per-page self-translations locally on the device. |
| `sidePanel` | permissions | Provides a persistent side-by-side dictionary inspector, 3D flashcard trainer, and Kana syllabary chart while browsing webpages. |
| `tabs` | permissions | Allows the Side Panel to communicate with the active tab to trigger webpage translation, native tokenization, or page restoration. |
| `scripting` | permissions | Enables content script interaction for word tokenization and inline translation drawers on web articles. |
| `contextMenus` | permissions | Lets users right-click any selected word or phrase on a webpage to inspect it in Quizzler or open the 3D Flashcard Studio. |
| `<all_urls>` | host_permissions | Allows users to translate and tokenize articles on any website they visit in their target language and perform dictionary lookups from the background worker without CORS errors. |

## Privacy & Data Use

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used or transferred for purposes unrelated to the extension's single purpose
- [x] Data is NOT used or transferred to determine creditworthiness or for lending purposes

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-10-11 | Initial release with French & Japanese Quizzler dictionaries, multi-language webpage translation, on-page floating Inspector HUD, Side Panel, and Full-Screen 3D Flashcard Studio. |
