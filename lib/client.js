window.__ModuleLoader__.load({
	id: "dsh-word-translate",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		/** Stable plugin identity; also the `data-plugin` marker the module system cleans up. */
		const PLUGIN_ID = "dsh-word-translate";
		/** Host route this half posts a translation request to. */
		const TRANSLATE_PATH = "/plugins/dsh-word-translate/translate";
		/** Host route serving bundled-dictionary lookups (no model call). */
		const DICTIONARY_PATH = "/plugins/dsh-word-translate/dictionary";
		/** Host route serving the durable translation history. */
		const HISTORY_PATH = "/plugins/dsh-word-translate/history";
		/** Overlay cell id, so a future owner can address or replace this entry by name. */
		const MENU_CELL_ID = "dsh-word-translate.selection-menu";
		/** Style-tag identity, used to inject the sheet exactly once per page. */
		const CSS_ID = "dsh-word-translate/client.css";
		/** Overlay cell id for the history viewer. */
		const HISTORY_CELL_ID = "dsh-word-translate.history";
		/**
		* Id of the sidebar row that opens the history.
		*
		* It deliberately does NOT name a `main` panel: the row only opens the
		* overlay, and no `main` entry is registered under it (see
		* `HistorySidebarIcon` for why that matters).
		*/
		const HISTORY_ROW_ID = "dsh-word-translate.history-row";
		/** Label of the sidebar row; also its accessible name and collapsed tooltip. */
		const HISTORY_ROW_LABEL = "翻译记录";

		/**
		* Card styling. Every color goes through a shipped theme token so the menu
		* follows the active theme instead of hard-coding a palette.
		*/
		const MENU_CSS = `
.dsh-wt-root {
  position: fixed;
  z-index: 2147483000;
  min-width: 208px;
  max-width: 380px;
  /* Never grow past the viewport: a long translation used to run off the
     bottom of the screen with no way to read the rest. */
  max-height: calc(100vh - 16px);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.16));
  background: var(--dsw-alias-bg-overlay, #ffffff);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 13px;
  line-height: 1.5;
}
/* The controls keep their size; only the answer gives way when space runs out. */
.dsh-wt-actions,
.dsh-wt-volume {
  flex: 0 0 auto;
}
.dsh-wt-term {
  flex: 0 0 auto;
  padding: 4px 8px 6px;
  font-weight: 600;
  word-break: break-word;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
}
.dsh-wt-term-label {
  display: block;
  font-weight: 400;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-wt-item {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-wt-item:hover:not(:disabled),
.dsh-wt-item:focus-visible {
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06));
  outline: none;
}
.dsh-wt-item:disabled {
  cursor: default;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-wt-result {
  /* The answer is the one region allowed to shrink, and it scrolls once it
     does — so a long translation is always fully readable. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin-top: 6px;
  padding: 8px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.dsh-wt-result-error {
  color: var(--dsw-alias-state-error-primary, #d92d20);
}
.dsh-wt-meta {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-wt-result > .dsh-wt-meta:first-child {
  margin-top: 0;
}
.dsh-wt-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 4px 8px 2px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
}
.dsh-wt-volume-label {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: nowrap;
}
.dsh-wt-volume-input {
  flex: 1;
  min-width: 0;
  accent-color: var(--dsw-alias-brand-primary, #4561ee);
}
.dsh-wt-volume-value {
  min-width: 34px;
  font-size: 11px;
  text-align: right;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}
.dsh-wt-voice-select {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font: inherit;
  font-size: 11px;
}
/* --- dictionary card ------------------------------------------------------ */
.dsh-wt-dict-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-wt-dict-word {
  font-size: 15px;
  font-weight: 600;
}
.dsh-wt-dict-pos {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-wt-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.dsh-wt-badge {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 16px;
  white-space: nowrap;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* The Oxford-3000 flag is the strongest "learn this" signal, so it reads louder. */
.dsh-wt-badge-strong {
  border-color: transparent;
  background: var(--dsw-alias-state-business-primary, #4561ee);
  color: #ffffff;
}
.dsh-wt-badge-exam {
  border-color: transparent;
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-wt-dict-senses {
  margin-top: 6px;
  white-space: pre-wrap;
}
/* --- history viewer (an overlay, never a main panel) ---------------------- */
/* The sidebar row's glyph. It only has to fill the box the sidebar gives it and
   inherit the row's colour, so the icon follows hover and theme for free. */
.dsh-wt-row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: inherit;
}
.dsh-wt-overlay-root {
  position: fixed;
  inset: 0;
  z-index: 2147482900;
}
/* The scrim dims the conversation and closes the viewer when clicked. */
.dsh-wt-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
}
/* The viewer floats centred over the conversation; the page behind is untouched. */
.dsh-wt-viewer {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  width: min(820px, calc(100vw - 64px));
  height: min(660px, calc(100vh - 96px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.16));
  border-radius: 14px;
  background: var(--dsw-alias-bg-overlay, #ffffff);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
}
/* The bar is the drag handle, so it takes the grab cursor. */
.dsh-wt-viewer-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  cursor: grab;
  user-select: none;
}
.dsh-wt-viewer-bar:active {
  cursor: grabbing;
}
.dsh-wt-viewer-grip {
  color: var(--dsw-alias-label-secondary, #9ca3af);
  font-size: 14px;
  line-height: 1;
}
.dsh-wt-viewer-title {
  font-size: 16px;
  font-weight: 600;
}
.dsh-wt-panel-close {
  margin-left: 4px;
}
.dsh-wt-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px 18px 0;
  box-sizing: border-box;
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 14px;
}
.dsh-wt-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 0 0 auto;
}
.dsh-wt-panel-count {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsh-wt-panel-spacer {
  flex: 1;
}
.dsh-wt-panel-search {
  flex: 1 1 220px;
  min-width: 0;
  max-width: 340px;
  padding: 7px 11px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: inherit;
  font: inherit;
  font-size: 14px;
}
.dsh-wt-panel-button {
  padding: 7px 13px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dsh-wt-panel-button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-wt-panel-button:disabled {
  opacity: 0.5;
  cursor: default;
}
/* The armed state of the two-step clear button. */
.dsh-wt-panel-button-danger {
  border-color: transparent;
  background: var(--dsw-alias-state-error-primary, #d92d20);
  color: #ffffff;
}
.dsh-wt-panel-button-danger:hover {
  background: var(--dsw-alias-state-error-primary, #d92d20);
  opacity: 0.9;
}
.dsh-wt-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin-top: 14px;
  padding-bottom: 20px;
}
.dsh-wt-panel-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 13px;
  line-height: 1.9;
}
.dsh-wt-record {
  display: flex;
  gap: 14px;
  padding: 14px 16px;
  margin-bottom: 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.09));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
}
.dsh-wt-record:hover {
  border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.18));
}
.dsh-wt-record-main {
  flex: 1 1 auto;
  min-width: 0;
}
/* The looked-up word leads the card and is the largest text on it. */
.dsh-wt-record-source {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}
.dsh-wt-record-translation {
  margin-top: 6px;
  font-size: 15px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
/* The context reads as one sentence, with the looked-up word marked in place. */
.dsh-wt-record-context {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.035));
  font-size: 14px;
  line-height: 1.7;
  color: var(--dsw-alias-label-secondary, #4b5563);
  word-break: break-word;
}
.dsh-wt-hit {
  padding: 0 3px;
  border-radius: 4px;
  background: var(--dsw-alias-state-business-primary, #4561ee);
  color: #ffffff;
  font-weight: 600;
}
.dsh-wt-record-actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}
.dsh-wt-icon-button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
}
.dsh-wt-icon-button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-primary, #1f2328);
}
.dsh-wt-icon-button-danger:hover {
  color: var(--dsw-alias-state-error-primary, #d92d20);
}
.dsh-wt-panel-note {
  flex: 0 0 auto;
  padding: 6px 0 12px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
`;

		/** Inject the shared sheet once; the module system removes it on unload. */
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) === null) {
			const styleTag = document.createElement("style");
			styleTag.dataset.plugin = PLUGIN_ID;
			styleTag.dataset.pluginCss = CSS_ID;
			styleTag.textContent = MENU_CSS;
			document.head.appendChild(styleTag);
		}

		/**
		* Tags that read as "one paragraph" for context capture.
		*
		* A selection inside any of these is scoped to that block before the
		* sentence-level pass runs.
		*/
		const BLOCK_TAGS = new Set([
			"P", "LI", "DIV", "TD", "TH", "DD", "DT", "PRE", "BLOCKQUOTE",
			"H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "FIGCAPTION"
		]);

		/** Longest context string this half will send for one side. */
		const CONTEXT_LIMIT = 2000;

		/**
		* Longest neighbouring-block text used to top up a short sentence.
		*
		* Neighbouring blocks are a FALLBACK, and they are capped tightly: a whole
		* adjacent list or code block is mostly noise, and it used to arrive
		* concatenated into one meaningless run (`侧边栏出现「翻译记录」图标右键菜单变成…`).
		* The selection's own sentence is the real context; this only widens it when
		* that sentence is too short to disambiguate.
		*/
		const NEIGHBOUR_LIMIT = 400;

		/**
		* Shortest sentence-side text that is accepted as sufficient context.
		*
		* Below this the sentence alone is unlikely to pin down the sense — a
		* three-character fragment such as `还是 ` does not tell the model anything —
		* so the neighbouring block is appended as well.
		*/
		const MIN_SENTENCE_CONTEXT = 12;

		/**
		* Characters that end a sentence.
		*
		* Both ASCII and the full-width CJK forms, because the surrounding prose is
		* Chinese while the selected term is English, so a sentence boundary can be
		* either kind.
		*/
		const SENTENCE_END = /[.!?。！？;；\n\r]/u;

		/**
		* Longest selection still echoed above the two actions.
		*
		* A word or short phrase is worth confirming — the user wants to know what
		* the menu is about to act on. A paragraph-length selection is already
		* visible behind the menu, and echoing it would push "翻译" and "朗读" off
		* the screen for no benefit.
		*/
		const SELECTION_ECHO_MAX_CHARS = 40;

		/** Where the chosen speech volume is remembered between page loads. */
		const VOLUME_STORAGE_KEY = "dsh-word-translate.volume";

		/** Default speech volume, matching the browser's own default. */
		const DEFAULT_VOLUME = 1;

		/**
		* Read the remembered speech volume.
		*
		* Storage can be unavailable (a locked-down profile, private mode), so every
		* access is guarded and falls back to the default rather than failing.
		*
		* @returns a volume in [0, 1].
		*/
		function readStoredVolume() {
			try {
				const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
				if (raw === null) return DEFAULT_VOLUME;
				const value = Number(raw);
				if (!Number.isFinite(value)) return DEFAULT_VOLUME;
				return Math.min(1, Math.max(0, value));
			} catch {
				return DEFAULT_VOLUME;
			}
		}

		/**
		* Remember the chosen speech volume.
		* @param value - a volume in [0, 1].
		*/
		function storeVolume(value) {
			try {
				window.localStorage.setItem(VOLUME_STORAGE_KEY, String(value));
			} catch {
				/* an unwritable store just means the choice does not persist */
			}
		}

		/** Whether a selection looks like English text this menu should act on. */
		function looksEnglish(text) {
			return /[A-Za-z]/.test(text);
		}

		/** Collapse whitespace so a paragraph travels as one line. */
		function flatten(text) {
			return (text ?? "").replace(/\s+/gu, " ").trim();
		}

		/** The nearest paragraph-like ancestor of a selection node. */
		function blockElementOf(node) {
			let element = node === null || node === undefined ? null : node.nodeType === 1 ? node : node.parentElement;
			while (element !== null && element !== document.body && element !== document.documentElement) {
				if (BLOCK_TAGS.has(element.tagName)) return element;
				element = element.parentElement;
			}
			return element;
		}

		/** Read one element's visible text. */
		function textOf(element) {
			if (element === null || element === undefined) return "";
			return flatten(element.innerText ?? element.textContent ?? "");
		}

		/**
		* Find the nearest sibling paragraph on one side.
		*
		* A selection often sits in a `<code>` or `<strong>` inside its paragraph,
		* so the search walks up a few ancestors before giving up; the first
		* non-empty sibling wins, and an empty result means "no context that side".
		*
		* @param element - the selection's paragraph-like ancestor.
		* @param direction - which side to read.
		* @returns the neighbouring paragraph text, or an empty string.
		*/
		function siblingText(element, direction) {
			let node = element;
			for (let depth = 0; depth < 3 && node !== null && node !== undefined; depth += 1) {
				const sibling = direction === "before" ? node.previousElementSibling : node.nextElementSibling;
				if (sibling !== null) {
					const text = textOf(sibling);
					if (text.length > 0) return text;
				}
				node = node.parentElement;
			}
			return "";
		}

		/**
		* Split a block's text around the selection.
		*
		* This is the fix for the plugin's worst context bug. The original capture
		* took only the PREVIOUS and NEXT sibling blocks, which meant the rest of the
		* selection's OWN sentence was never sent: selecting `false` in
		*
		*     重启后如果 durable 还是 false，告诉我，我再查。
		*
		* produced `before` = the preceding list and `after` = an unrelated paragraph,
		* so the model saw the bare word with none of the sentence that gives it
		* meaning. Here the block's own text is used first, and the sentence
		* containing the selection is cut out of it.
		*
		* @param blockText - the flattened text of the selection's block.
		* @param selected - the selected text.
		* @returns the text before and after the selection within the block, or null
		* when the selection cannot be located in the block's text.
		*/
		function splitBlockAroundSelection(blockText, selected) {
			if (blockText.length === 0 || selected.length === 0) return null;
			const at = blockText.indexOf(selected);
			if (at < 0) return null;
			return {
				before: blockText.slice(0, at),
				after: blockText.slice(at + selected.length)
			};
		}

		/**
		* Trim one side of the context down to the sentence touching the selection.
		*
		* @param text - the text on one side of the selection, within its block.
		* @param direction - `before` keeps the tail (the sentence just before);
		* `after` keeps the head.
		* @returns the sentence-level slice, trimmed.
		*/
		function sentenceSide(text, direction) {
			if (text.length === 0) return "";
			if (direction === "before") {
				// Walk back to the nearest sentence end and keep what follows it.
				for (let index = text.length - 1; index >= 0; index -= 1) {
					if (SENTENCE_END.test(text[index])) return text.slice(index + 1).trim();
				}
				return text.trim();
			}
			// Walk forward to the nearest sentence end and keep what precedes it.
			for (let index = 0; index < text.length; index += 1) {
				if (SENTENCE_END.test(text[index])) return text.slice(0, index).trim();
			}
			return text.trim();
		}

		/**
		* Capture the selected term and the context that actually explains it.
		*
		* Two selection surfaces are supported: a text field (the composer, where
		* `window.getSelection()` reports nothing) and ordinary rendered content.
		*
		* Context precedence, most relevant first:
		*
		* 1. **The selection's own sentence**, taken from its block. This is the text
		*    that determines the sense, and it is what the original implementation
		*    discarded.
		* 2. **The rest of its block**, when the sentence alone is very short.
		* 3. **The neighbouring blocks**, capped, only as a last resort when the block
		*    yields nothing usable.
		*
		* @returns the captured request, or null when there is nothing to act on.
		*/
		function captureSelection() {
			const active = document.activeElement;
			if (active !== null && active !== undefined) {
				const tag = active.tagName;
				const isTextField = tag === "TEXTAREA" || (tag === "INPUT" && /^(?:text|search)$/iu.test(active.type ?? "text"));
				if (isTextField) {
					const start = active.selectionStart ?? 0;
					const end = active.selectionEnd ?? 0;
					if (end <= start) return null;
					const selected = active.value.slice(start, end).trim();
					if (selected.length === 0 || !looksEnglish(selected)) return null;
					// A text field is already linear, so the sentence cut applies
					// directly to the surrounding value.
					const rawBefore = active.value.slice(Math.max(0, start - CONTEXT_LIMIT), start);
					const rawAfter = active.value.slice(end, end + CONTEXT_LIMIT);
					return {
						selected: selected.slice(0, CONTEXT_LIMIT),
						before: sentenceSide(flatten(rawBefore), "before").slice(-CONTEXT_LIMIT),
						after: sentenceSide(flatten(rawAfter), "after").slice(0, CONTEXT_LIMIT)
					};
				}
			}

			const selection = window.getSelection();
			if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
			const selected = selection.toString().trim();
			if (selected.length === 0 || !looksEnglish(selected)) return null;

			const block = blockElementOf(selection.getRangeAt(0).startContainer);
			const blockText = textOf(block);
			const split = splitBlockAroundSelection(blockText, flatten(selected));

			let before = split === null ? "" : sentenceSide(split.before, "before");
			let after = split === null ? "" : sentenceSide(split.after, "after");

			// A very short sentence fragment cannot disambiguate anything, so the
			// block's remaining text is added — still scoped to the block, so it
			// stays on topic.
			if (split !== null && (before.length < MIN_SENTENCE_CONTEXT || after.length < MIN_SENTENCE_CONTEXT)) {
				if (before.length < MIN_SENTENCE_CONTEXT) before = split.before.trim();
				if (after.length < MIN_SENTENCE_CONTEXT) after = split.after.trim();
			}

			// Nothing usable in the block itself: fall back to the neighbouring
			// blocks, tightly capped so a big list cannot flood the request.
			if (before.length === 0 && after.length === 0) {
				before = siblingText(block, "before").slice(-NEIGHBOUR_LIMIT);
				after = siblingText(block, "after").slice(0, NEIGHBOUR_LIMIT);
			}

			return {
				selected: selected.slice(0, CONTEXT_LIMIT),
				before: before.slice(-CONTEXT_LIMIT),
				after: after.slice(0, CONTEXT_LIMIT)
			};
		}

		/** Where the chosen speech voice is remembered between page loads. */
		const VOICE_STORAGE_KEY = "dsh-word-translate.voice";

		/**
		* Every installed English voice, in a stable display order.
		*
		* `getVoices()` is empty until the browser has loaded its voice list, which
		* happens asynchronously — so callers must tolerate an empty array and the
		* `voiceschanged` event must be listened for.
		*
		* @param synth - the speech synthesis object.
		* @returns installed English voices.
		*/
		function englishVoices(synth) {
			try {
				const all = synth.getVoices() ?? [];
				return all
					.filter((voice) => /^en[-_]?/iu.test(voice.lang ?? ""))
					.slice()
					.sort((left, right) => String(left.name).localeCompare(String(right.name)));
			} catch {
				return [];
			}
		}

		/**
		* Resolve the voice to speak with.
		*
		* An explicitly chosen voice wins; otherwise the first installed English
		* voice is used, because the browser default is often a non-English voice
		* that reads English badly (and quietly).
		*
		* @param synth - the speech synthesis object.
		* @param preferredName - the remembered voice name, if any.
		* @returns the voice to use, or null to let the browser decide.
		*/
		function resolveVoice(synth, preferredName) {
			const voices = englishVoices(synth);
			if (preferredName !== undefined && preferredName !== "") {
				const match = voices.find((voice) => voice.name === preferredName);
				if (match !== undefined) return match;
			}
			return voices.length > 0 ? voices[0] : null;
		}

		/** Read the remembered voice name. */
		function readStoredVoice() {
			try {
				return window.localStorage.getItem(VOICE_STORAGE_KEY) ?? "";
			} catch {
				return "";
			}
		}

		/** Remember the chosen voice name. */
		function storeVoice(name) {
			try {
				window.localStorage.setItem(VOICE_STORAGE_KEY, name);
			} catch {
				/* an unwritable store just means the choice does not persist */
			}
		}

		/**
		* Stop any speech in progress.
		*
		* `cancel()` is the only way to stop an utterance; it also fires that
		* utterance's `onend`/`onerror` in some browsers, which is why the toggle's
		* own callback is idempotent and simply clears the speaking state.
		*/
		function stopSpeaking() {
			try {
				window.speechSynthesis?.cancel();
			} catch {
				/* nothing to stop, or no synthesis support */
			}
		}

		/**
		* Speak English text with the browser's own speech synthesis.
		*
		* `cancel()` is called only when something is already speaking, and the
		* utterance is queued on a timer: Chromium drops an utterance that is
		* submitted in the same task as a `cancel()`, so cancelling unconditionally
		* would make the first click of a repeated use silent.
		*
		* `onDone` fires when the utterance finishes OR fails, so a caller showing
		* "speaking…" can always clear it — without that, a finished utterance left
		* the label on screen forever.
		*
		* @param text - the English term to read aloud.
		* @param volume - playback volume in [0, 1].
		* @param voiceName - the chosen voice's name, or an empty string for the default.
		* @param onDone - called once the utterance settles (ended, errored, or refused).
		* @returns an error message, or null when speaking started.
		*/
		function speakEnglish(text, volume, voiceName, onDone) {
			const synth = window.speechSynthesis;
			if (synth === undefined || synth === null) return "此浏览器不支持语音合成";
			try {
				if (synth.speaking || synth.pending) synth.cancel();
				const utterance = new SpeechSynthesisUtterance(text);
				utterance.lang = "en-US";
				utterance.rate = 0.95;
				utterance.volume = Math.min(1, Math.max(0, volume));
				const voice = resolveVoice(synth, voiceName);
				if (voice !== null) utterance.voice = voice;
				let settled = false;
				const settle = () => {
					if (settled) return;
					settled = true;
					onDone();
				};
				utterance.onend = settle;
				utterance.onerror = settle;
				// Queue after the current task so a preceding cancel() has settled.
				setTimeout(() => {
					try {
						synth.speak(utterance);
					} catch (error) {
						console.error("[dsh-word-translate] speech synthesis failed:", error);
						settle();
					}
				}, 0);
				return null;
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		}

		/**
		* POST one JSON request to a Host route and parse the reply.
		*
		* Every route in this plugin shares the shape, so the fetch, the non-JSON
		* guard, and the error extraction live here once.
		*
		* @param path - the Host route.
		* @param payload - the JSON body.
		* @returns the parsed reply body.
		*/
		async function postJson(path, payload) {
			const response = await fetch(path, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			});
			let body = null;
			try {
				body = await response.json();
			} catch {
				/* a non-JSON answer falls back to the status code below */
			}
			if (!response.ok) throw new Error(body?.error ?? `请求失败（HTTP ${response.status}）`);
			return body;
		}

		/** Ask the Host half for a bundled-dictionary lookup. Never calls a model. */
		async function requestDictionary(selected) {
			const body = await postJson(DICTIONARY_PATH, { selected });
			if (body?.found !== true) return null;
			return body.entry ?? null;
		}

		/** Read the durable translation history. */
		async function requestHistory(action, payload) {
			return postJson(HISTORY_PATH, { action, ...(payload ?? {}) });
		}

		/** Ask the Host half for the context-aware Chinese translation. */
		async function requestTranslation(payload) {
			const body = await postJson(TRANSLATE_PATH, payload);
			const translation = typeof body?.translation === "string" ? body.translation.trim() : "";
			if (translation.length === 0) throw new Error("模型没有返回译文");
			const usage = body?.usage;
			return {
				translation,
				cached: body?.cached === true,
				source: typeof body?.source === "string" ? body.source : undefined,
				usage: usage === undefined || usage === null
					? undefined
					: {
						inputTokens: Number(usage.inputTokens) || 0,
						outputTokens: Number(usage.outputTokens) || 0,
						totalTokens: Number(usage.totalTokens) || 0
					}
			};
		}

		/**
		* Pick the session whose model a translation should use: the one the main
		* view is showing.
		*
		* `retainedBy.mainView` is the sidebar's own definition of "the session on
		* screen" — the same signal the shell uses to decide which conversation is
		* resident — so the menu follows whatever the user is actually reading
		* instead of guessing from recency.
		*
		* @param list - the `useSessions` list snapshot.
		* @returns the resident session id, or undefined when none is retained.
		*/
		function mainSessionIdOf(list) {
			const byId = list?.byId;
			if (byId === undefined || byId === null) return undefined;
			const current = list.currentId;
			if (typeof current === "string" && (byId[current]?.retainedBy?.mainView ?? 0) > 0) return current;
			for (const id of list.ids ?? []) {
				if ((byId[id]?.retainedBy?.mainView ?? 0) > 0) return id;
			}
			return undefined;
		}

		/**
		* Stand-in for the `useSessions` standard prop.
		*
		* `shell.overlay` declares `useSessions`, so the renderer binds the real
		* hook; this exists only so a composition that stops binding it degrades to
		* "translate with the deployment default model" instead of crashing the
		* entry. It is called through the same single call site as the real hook, so
		* hook order never depends on which one is present.
		*
		* @returns undefined — no session is resolvable without the real hook.
		*/
		function absentSessionsHook() {
			return undefined;
		}

		/**
		* Render one dictionary entry.
		*
		* The study signals are the point of this card, not the translation: a
		* learner's real question is "is this word worth learning?", and the Collins
		* rating, the Oxford flag, the exam tags and the frequency rank answer it.
		* They are therefore shown above the senses, where they are read first.
		*
		* @param props - `entry` is the lookup result from the Host half.
		*/
		function DictionaryCard(props) {
			const { entry } = props;
			const badges = [];
			if (entry.oxford === true) badges.push(React.createElement("span", { key: "ox", className: "dsh-wt-badge dsh-wt-badge-strong" }, "牛津3000"));
			if (typeof entry.collinsLabel === "string" && entry.collinsLabel.length > 0) {
				badges.push(React.createElement("span", { key: "co", className: "dsh-wt-badge" }, entry.collinsLabel));
			}
			for (const tag of entry.tags ?? []) {
				badges.push(React.createElement("span", { key: `t-${tag}`, className: "dsh-wt-badge dsh-wt-badge-exam" }, tag));
			}

			// The more frequent a word, the more worth learning — so the rank is
			// stated in words, not as a bare number the reader must interpret.
			const ranks = [];
			if (entry.bncRank > 0) ranks.push(`BNC ${String(entry.bncRank)}`);
			if (entry.cocaRank > 0) ranks.push(`COCA ${String(entry.cocaRank)}`);

			const head = [entry.word];
			if (typeof entry.phonetic === "string" && entry.phonetic.length > 0) head.push(`/${entry.phonetic}/`);

			return React.createElement(
				"div",
				{ className: "dsh-wt-result dsh-wt-dict" },
				React.createElement(
					"div",
					{ className: "dsh-wt-dict-head" },
					React.createElement("span", { className: "dsh-wt-dict-word" }, head.join(" ")),
					entry.partOfSpeech ? React.createElement("span", { className: "dsh-wt-dict-pos" }, entry.partOfSpeech) : null
				),
				typeof entry.matchedForm === "string" && entry.matchedForm.length > 0
					? React.createElement("div", { className: "dsh-wt-meta" }, `（${entry.matchedForm} → ${entry.word}）`)
					: null,
				badges.length > 0 ? React.createElement("div", { className: "dsh-wt-badges" }, badges) : null,
				React.createElement("div", { className: "dsh-wt-dict-senses" }, entry.translation),
				ranks.length > 0
					? React.createElement("div", { className: "dsh-wt-meta" }, `词频：${ranks.join(" · ")}（数字越小越常用）`)
					: null
			);
		}

		/**
		* Render one stored translation.
		*
		* The context is shown because it is what makes the record useful later: the
		* same word in a different sentence is a different answer, so a bare
		* word/translation pair would lose the very thing that made the translation
		* correct.
		*
		* The context renders as ONE flowing sentence with the looked-up word
		* highlighted in place. An earlier revision stacked `before` and `after` as
		* two separate lines, which dropped the word itself out of the middle — the
		* reader saw `…会调用` above `0，这同时…` with no hint of what was looked up.
		*
		* @param props - `record`, plus `onCopy`, `onSpeak` and `onDelete` callbacks.
		*/
		function HistoryRecord(props) {
			const { record, onCopy, onSpeak, onDelete } = props;
			const before = typeof record.before === "string" ? record.before : "";
			const after = typeof record.after === "string" ? record.after : "";
			const hasContext = before.length > 0 || after.length > 0;

			/**
			* The context with the looked-up term highlighted in place.
			*
			* `before` and `after` are the two sides of the selection, so re-joining
			* them with the term in the middle reproduces the sentence the user read.
			* The term is inserted unconditionally rather than searched for: the two
			* sides were cut around it, so it belongs exactly between them — and if a
			* capture ever trimmed it, inserting it still leaves a correct sentence
			* instead of a gap.
			*/
			const contextParts = [
				React.createElement("span", { key: "b" }, before),
				React.createElement("mark", { key: "s", className: "dsh-wt-hit" }, record.selected),
				React.createElement("span", { key: "a" }, after)
			];

			return React.createElement(
				"div",
				{ className: "dsh-wt-record" },
				React.createElement(
					"div",
					{ className: "dsh-wt-record-main" },
					React.createElement("div", { className: "dsh-wt-record-source" }, record.selected),
					React.createElement("div", { className: "dsh-wt-record-translation" }, record.translation),
					hasContext
						? React.createElement("div", { className: "dsh-wt-record-context" }, contextParts)
						: null
				),
				React.createElement(
					"div",
					{ className: "dsh-wt-record-actions" },
					React.createElement(
						"button",
						{
							type: "button",
							className: "dsh-wt-icon-button",
							title: "复制原文和译文",
							"aria-label": "复制",
							onClick: () => onCopy(record)
						},
						"⧉"
					),
					React.createElement(
						"button",
						{
							type: "button",
							className: "dsh-wt-icon-button",
							title: "朗读原文",
							"aria-label": "朗读",
							onClick: () => onSpeak(record)
						},
						"🔊"
					),
					React.createElement(
						"button",
						{
							type: "button",
							className: "dsh-wt-icon-button dsh-wt-icon-button-danger",
							title: "删除这条记录",
							"aria-label": "删除",
							onClick: () => onDelete(record)
						},
						"✕"
					)
				)
			);
		}

		/**
		* The translation-history viewer body.
		*
		* This is the plugin's memory made visible: every AI translation lands here,
		* the entries can be searched and deleted, and a word looked up repeatedly
		* shows up repeatedly — which is the honest signal of what is worth learning.
		*
		* It is rendered INSIDE an overlay card (`HistoryOverlay`), never into the
		* `main` slot: occupying `main` unmounts the conversation and its composer.
		*
		* @param props - `onClose` dismisses the viewer.
		*/
		function HistoryPanel(props) {
			const { onClose } = props;
			const [records, setRecords] = React.useState([]);
			const [status, setStatus] = React.useState("loading");
			const [error, setError] = React.useState("");
			const [durable, setDurable] = React.useState(true);
			const [search, setSearch] = React.useState("");
			/**
			* Whether the clear button is waiting for a second click.
			*
			* The confirmation is INLINE rather than a dialog. `window.confirm` is a
			* synchronous native dialog that blocks the renderer's main thread, and
			* DSH's composer is a `contenteditable`: the composer loses its selection
			* and focus while the dialog is up and never regains it, which leaves the
			* session unable to accept input until a restart. The entire shipped UI
			* avoids `window.confirm` for this reason (zero uses in the bundle), so
			* this plugin must not use it either.
			*
			* A two-step button is also a better fit here: clearing records is not
			* destructive enough to deserve a modal, and the second click is just as
			* deliberate.
			*/
			const [confirmingClear, setConfirmingClear] = React.useState(false);

			const reload = React.useCallback(async () => {
				try {
					const body = await requestHistory("list");
					setRecords(Array.isArray(body?.records) ? body.records : []);
					setDurable(body?.durable !== false);
					setStatus("ready");
					setError("");
				} catch (failure) {
					setError(failure instanceof Error ? failure.message : String(failure));
					setStatus("error");
				}
			}, []);

			React.useEffect(() => {
				void reload();
			}, [reload]);

			const onDelete = React.useCallback(
				async (record) => {
					// Optimistic: the row disappears at once, and a failure restores it
					// by reloading rather than leaving the list quietly wrong.
					setRecords((current) => current.filter((item) => item.id !== record.id));
					try {
						await requestHistory("delete", { id: record.id });
					} catch {
						void reload();
					}
				},
				[reload]
			);

			/**
			* Clear every record, on the second click.
			*
			* The first click arms the button and relabels it; the second commits. An
			* armed state disarms itself after a few seconds so a stray click cannot
			* leave a live "delete everything" button sitting there.
			*/
			const onClear = React.useCallback(async () => {
				if (!confirmingClear) {
					setConfirmingClear(true);
					return;
				}
				setConfirmingClear(false);
				try {
					await requestHistory("clear");
					await reload();
				} catch (failure) {
					setError(failure instanceof Error ? failure.message : String(failure));
				}
			}, [confirmingClear, reload]);

			/** Disarm the clear button a few seconds after it is armed. */
			React.useEffect(() => {
				if (!confirmingClear) return undefined;
				const timer = setTimeout(() => setConfirmingClear(false), 4000);
				return () => clearTimeout(timer);
			}, [confirmingClear]);

			const onCopy = React.useCallback((record) => {
				const text = `${record.selected}\n${record.translation}`;
				// The clipboard API needs a secure context; the fallback keeps the
				// button working if it is unavailable.
				navigator.clipboard?.writeText(text).catch(() => {});
			}, []);

			const onSpeak = React.useCallback((record) => {
				speakEnglish(record.selected, readStoredVolume(), readStoredVoice(), () => {});
			}, []);

			const query = search.trim().toLowerCase();
			const visible = query.length === 0
				? records
				: records.filter((record) =>
					`${record.selected} ${record.translation} ${record.before ?? ""} ${record.after ?? ""}`
						.toLowerCase()
						.includes(query)
				);

			const body = [];
			if (status === "loading") {
				body.push(React.createElement("div", { key: "loading", className: "dsh-wt-panel-empty" }, "读取中…"));
			} else if (status === "error") {
				body.push(React.createElement("div", { key: "error", className: "dsh-wt-panel-empty" }, `读取失败：${error}`));
			} else if (records.length === 0) {
				body.push(
					React.createElement(
						"div",
						{ key: "empty", className: "dsh-wt-panel-empty" },
						"还没有翻译记录。",
						React.createElement("br"),
						"在英文内容里选中文字，右键点「AI 翻译」，结果就会存到这里。"
					)
				);
			} else if (visible.length === 0) {
				body.push(React.createElement("div", { key: "nomatch", className: "dsh-wt-panel-empty" }, `没有匹配「${search}」的记录。`));
			} else {
				for (const record of visible) {
					body.push(
						React.createElement(HistoryRecord, {
							key: record.id,
							record,
							onCopy,
							onSpeak,
							onDelete
						})
					);
				}
			}

			return React.createElement(
				"div",
				{ className: "dsh-wt-panel" },
				React.createElement(
					"div",
					{ className: "dsh-wt-panel-head" },
					// The title lives in the drag bar above, so this row leads with the
					// count and the controls instead of repeating it.
					React.createElement(
						"span",
						{ className: "dsh-wt-panel-count" },
						query.length === 0
							? `${String(records.length)} 条`
							: `${String(visible.length)} / ${String(records.length)} 条`
					),
					React.createElement("span", { className: "dsh-wt-panel-spacer" }),
					React.createElement("input", {
						type: "search",
						className: "dsh-wt-panel-search",
						placeholder: "搜索原文或译文…",
						value: search,
						onChange: (event) => setSearch(event.target.value),
						"aria-label": "搜索翻译记录"
					}),
					React.createElement(
						"button",
						{ type: "button", className: "dsh-wt-panel-button", onClick: () => void reload() },
						"刷新"
					),
					React.createElement(
						"button",
						{
							type: "button",
							className: confirmingClear
								? "dsh-wt-panel-button dsh-wt-panel-button-danger"
								: "dsh-wt-panel-button",
							disabled: records.length === 0,
							title: confirmingClear ? "再点一次确认清空" : "清空全部记录",
							onClick: () => void onClear()
						},
						confirmingClear ? `确认清空 ${String(records.length)} 条` : "清空"
					),
					// The viewer floats over the conversation, so it needs its own way
					// out; Escape also closes it (bound by the overlay).
					React.createElement(
						"button",
						{
							type: "button",
							className: "dsh-wt-icon-button dsh-wt-panel-close",
							title: "关闭（Esc）",
							"aria-label": "关闭翻译记录",
							onClick: onClose
						},
						"✕"
					)
				),
				React.createElement("div", { className: "dsh-wt-panel-body" }, body),
				durable
					? null
					: React.createElement(
						"div",
						{ className: "dsh-wt-panel-note" },
						"⚠️ 持久化存储不可用，这些记录在重启后会丢失。"
					)
			);
		}

		/**
		* Open/closed state for the history viewer, shared across two slots.
		*
		* The trigger lives in the composer's own tool row (its designed seat, so it
		* can never overlap the composer) while the viewer itself must live in
		* `shell.overlay` to float above the frame. Those are two separate slot
		* registrations, so they are two separate components and cannot share React
		* state directly — hence this tiny store. It is deliberately not
		* `useSyncExternalStore`, which would tie the plugin to a React version.
		*/
		const historyView = (() => {
			let open = false;
			const listeners = new Set();
			return {
				isOpen: () => open,
				set(next) {
					if (open === next) return;
					open = next;
					for (const listener of [...listeners]) listener();
				},
				toggle() {
					this.set(!open);
				},
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				}
			};
		})();

		/** Follow `historyView` with component state, so any React version works. */
		function useHistoryOpen() {
			const [open, setOpen] = React.useState(historyView.isOpen);
			React.useEffect(() => historyView.subscribe(() => setOpen(historyView.isOpen())), []);
			return open;
		}

		/**
		* The history viewer as a floating card.
		*
		* It lives in `shell.overlay`, which floats ABOVE the frame and never
		* participates in the `main` slot's keyed dispatch — so opening or closing it
		* cannot unmount the conversation or its composer.
		*
		* An earlier revision registered a `main` panel selected from the sidebar,
		* which did exactly that damage: the conversation renders inside `main` under
		* the `conversation` key, so selecting another key removed it, and since the
		* conversation is the `activePanelId === null` default rather than a sidebar
		* row, there was no way back.
		*/
		function HistoryOverlay() {
			const open = useHistoryOpen();
			const close = React.useCallback(() => historyView.set(false), []);
			/**
			* Drag offset from the centred default, so the card can be moved aside.
			*
			* `null` means "not moved yet", which keeps the CSS centring in charge.
			* Once dragged, an explicit `left`/`top` takes over.
			*/
			const [position, setPosition] = React.useState(null);
			const dragRef = React.useRef(null);

			/** Escape closes the viewer, matching every other dismissible surface. */
			React.useEffect(() => {
				if (!open) return undefined;
				const onKeyDown = (event) => {
					if (event.key === "Escape") historyView.set(false);
				};
				document.addEventListener("keydown", onKeyDown, true);
				return () => document.removeEventListener("keydown", onKeyDown, true);
			}, [open]);

			/** Reset the drag offset whenever the viewer reopens. */
			React.useEffect(() => {
				if (!open) setPosition(null);
			}, [open]);

			/**
			* Follow a drag on the title bar.
			*
			* The listeners live on `document` rather than the bar so the pointer can
			* leave the bar mid-drag without dropping it — the standard drag idiom.
			* The card is clamped so it can never be dragged fully off screen.
			*/
			const onDragStart = React.useCallback((event) => {
				// Ignore a drag that starts on a control inside the bar.
				if (event.target?.closest?.("button, input, select")) return;
				const node = event.currentTarget.parentElement;
				if (node === null || node === undefined) return;
				const rect = node.getBoundingClientRect();
				dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
				event.preventDefault();

				const onMove = (moveEvent) => {
					const drag = dragRef.current;
					if (drag === null) return;
					const width = rect.width;
					const height = rect.height;
					// Keep at least a strip of the card on screen.
					const left = Math.max(8 - width + 80, Math.min(moveEvent.clientX - drag.dx, window.innerWidth - 80));
					const top = Math.max(8, Math.min(moveEvent.clientY - drag.dy, window.innerHeight - 48));
					setPosition({ left, top });
				};
				const onUp = () => {
					dragRef.current = null;
					document.removeEventListener("mousemove", onMove, true);
					document.removeEventListener("mouseup", onUp, true);
				};
				document.addEventListener("mousemove", onMove, true);
				document.addEventListener("mouseup", onUp, true);
			}, []);

			if (!open) return null;

			/** Once dragged, position explicitly; until then the CSS centres it. */
			const style = position === null
				? undefined
				: { left: `${String(position.left)}px`, top: `${String(position.top)}px`, transform: "none" };

			return React.createElement(
				"div",
				{ className: "dsh-wt-overlay-root" },
				// A full-frame scrim: it closes the viewer on click and stops the
				// conversation behind it from receiving stray input.
				React.createElement("div", {
					className: "dsh-wt-scrim",
					onClick: close,
					"aria-hidden": "true"
				}),
				React.createElement(
					"div",
					{
						className: "dsh-wt-viewer",
						style,
						role: "dialog",
						"aria-modal": "true",
						"aria-label": "翻译记录"
					},
					// The bar is the drag handle; the panel below owns the content.
					React.createElement(
						"div",
						{ className: "dsh-wt-viewer-bar", onMouseDown: onDragStart, title: "拖动可移动窗口" },
						React.createElement("span", { className: "dsh-wt-viewer-grip", "aria-hidden": "true" }, "⠿"),
						React.createElement("span", { className: "dsh-wt-viewer-title" }, "翻译记录")
					),
					React.createElement(HistoryPanel, { onClose: close })
				)
			);
		}

		/**
		* The sidebar row that opens the translation history.
		*
		* ## Why this is not an ordinary `sidebar.panellist` entry
		*
		* The sidebar renders every panel row itself, and its click handler calls
		* `ctx.layout.selectPanel(id)`. That method throws when no `main` panel is
		* registered under the same id, so an entry that only wants to open an
		* overlay cannot simply be registered: the click would raise
		* `layout.selectPanel: main panel "…" is not registered`.
		*
		* Registering a matching `main` panel instead is what this plugin used to do,
		* and it was a design error with a severe consequence: the conversation and
		* its composer are rendered inside `main` under the `conversation` key, so
		* selecting another key unmounted them, and since the conversation is the
		* `activePanelId === null` default rather than a sidebar row, there was no way
		* back.
		*
		* So the row keeps the sidebar's own markup and look, but swallows the click
		* in the capture phase — before the sidebar's handler sees it — and opens the
		* overlay instead. `stopPropagation` on the capture phase is what prevents the
		* throw; the row therefore never changes the selected panel and the
		* conversation is never unmounted.
		*
		* The glyph is drawn here rather than borrowed from the icon set, because a
		* client plugin cannot import the harness's icon package.
		*
		* @param props - the sidebar's icon share: `size` in px, and `active` (always
		* false here, since this row never becomes the selected panel).
		* @returns the icon element.
		*/
		function HistorySidebarIcon({ size }) {
			const edge = typeof size === "number" ? size : 18;
			return React.createElement(
				"svg",
				{
					width: edge,
					height: edge,
					viewBox: "0 0 16 16",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.3,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					focusable: "false"
				},
				// A clock face with a counter-clockwise arrow: the conventional
				// "history" glyph.
				React.createElement("path", { d: "M2.6 8a5.4 5.4 0 1 0 1.7-3.9" }),
				React.createElement("path", { d: "M2.2 2.6v3.1h3.1" }),
				React.createElement("path", { d: "M8 5.2V8l2 1.3" })
			);
		}

		/**
		* Wrap the history icon so a click opens the overlay instead of selecting a
		* panel.
		*
		* The interception is installed on the row's own `<button>`, found by walking
		* up from the icon. It is bound in the capture phase so it runs before the
		* sidebar's React handler, and it is bound on the DOM node rather than through
		* a React prop because the button belongs to the sidebar, not to this plugin.
		*
		* @param props - the sidebar's icon share.
		* @returns the icon, with the row's click intercepted.
		*/
		function HistorySidebarRow(props) {
			const hostRef = React.useRef(null);

			React.useEffect(() => {
				const host = hostRef.current;
				if (host === null || host === undefined) return undefined;
				const row = typeof host.closest === "function" ? host.closest("button") : null;
				if (row === null) return undefined;

				/**
				* Open the history and keep the event from reaching the sidebar.
				*
				* `preventDefault` stops the button's default activation,
				* `stopPropagation` keeps the sidebar's own onClick from running, and
				* both are needed: the sidebar's handler is what would call
				* `selectPanel` and throw.
				*/
				const intercept = (event) => {
					event.preventDefault();
					event.stopPropagation();
					historyView.set(true);
				};

				row.addEventListener("click", intercept, true);
				return () => row.removeEventListener("click", intercept, true);
			}, []);

			return React.createElement(
				"span",
				{ ref: hostRef, className: "dsh-wt-row-icon" },
				React.createElement(HistorySidebarIcon, props)
			);
		}

		/**
		* The frame-wide selection menu.
		*
		* It renders nothing until a right-click lands on English text, so the
		* overlay stays invisible the rest of the time.
		*
		* @param props - `useSessions` is a standard prop of the `shell.overlay`
		* slot (the renderer binds it at the outlet); it resolves the session whose
		* model a translation should call.
		*/
		function SelectionMenu(props) {
			// One unconditional call site, whether or not the prop was bound.
			const useSessions = typeof props.useSessions === "function" ? props.useSessions : absentSessionsHook;
			const sessionId = useSessions((list) => mainSessionIdOf(list), Object.is);
			const sessionIdRef = React.useRef(sessionId);
			sessionIdRef.current = sessionId;
			const [menu, setMenu] = React.useState(null);
			/**
			* The card's CONTENT: the dictionary entry or the AI translation.
			*
			* Deliberately separate from `speaking` below. They used to share one
			* state object, so pressing 朗读 replaced the dictionary entry or the
			* translation with a "speaking" marker and the content vanished. Reading
			* the word aloud must not discard what the user just looked up.
			*/
			const [result, setResult] = React.useState(null);
			/** Whether audio is currently playing; drives the 朗读/停止朗读 label only. */
			const [speaking, setSpeaking] = React.useState(false);
			const [volume, setVolume] = React.useState(readStoredVolume);
			const [voiceName, setVoiceName] = React.useState(readStoredVoice);
			const [voices, setVoices] = React.useState([]);
			/** Measured card size, so placement uses the real box instead of a guess. */
			const [cardSize, setCardSize] = React.useState({ width: 0, height: 0 });
			const rootRef = React.useRef(null);

			/**
			* Re-measure the card whenever its content changes.
			*
			* A long translation is far taller than any fixed estimate, and the card
			* must be re-placed from its REAL box or it runs off the bottom of the
			* screen. This runs before paint, so the corrected position is what the
			* user sees — no visible jump.
			*/
			React.useLayoutEffect(() => {
				if (menu === null) return;
				const node = rootRef.current;
				if (node === null) return;
				const rect = node.getBoundingClientRect();
				setCardSize((current) =>
					Math.abs(current.width - rect.width) < 1 && Math.abs(current.height - rect.height) < 1
						? current
						: { width: rect.width, height: rect.height }
				);
			});

			/**
			* Keep the installed-voice list current.
			*
			* `getVoices()` is empty on first render and fills in later, and some
			* browsers only populate it after a `voiceschanged` event — so the list is
			* read once on mount and again on every change.
			*/
			React.useEffect(() => {
				const synth = window.speechSynthesis;
				if (synth === undefined || synth === null) return undefined;
				const sync = () => setVoices(englishVoices(synth));
				sync();
				synth.addEventListener?.("voiceschanged", sync);
				return () => synth.removeEventListener?.("voiceschanged", sync);
			}, []);

			/** Watch for a right-click on English text. */
			React.useEffect(() => {
				const onContextMenu = (event) => {
					const captured = captureSelection();
					if (captured === null) return;
					event.preventDefault();
					event.stopPropagation();
					setResult(null);
					// A new selection starts silent: any audio from the previous one is
					// stopped, so the label must not carry over as "停止朗读".
					stopSpeaking();
					setSpeaking(false);
					setCardSize({ width: 0, height: 0 });
					setMenu({ x: event.clientX, y: event.clientY, ...captured });
				};
				document.addEventListener("contextmenu", onContextMenu, true);
				return () => document.removeEventListener("contextmenu", onContextMenu, true);
			}, []);

			/** Dismiss on an outside press or Escape. */
			React.useEffect(() => {
				if (menu === null) return undefined;
				const onPointerDown = (event) => {
					if (rootRef.current !== null && rootRef.current.contains(event.target)) return;
					setMenu(null);
					setResult(null);
				};
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					setMenu(null);
					setResult(null);
				};
				document.addEventListener("mousedown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown, true);
				return () => {
					document.removeEventListener("mousedown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown, true);
				};
			}, [menu]);

			/**
			* Copy the selection to the clipboard.
			*
			* This exists because the menu calls `preventDefault()` on the contextmenu
			* event to replace the browser's own menu — which also takes away the
			* system Copy item. Without this button there was no way to copy at all.
			*
			* The clipboard API needs a secure context (this page qualifies: loopback
			* counts as secure), and it can still reject without a user gesture, so a
			* `execCommand` fallback keeps the button working.
			*/
			const onCopy = React.useCallback(() => {
				if (menu === null) return;
				const text = menu.selected;
				const done = () => setResult({ status: "copied" });
				const fallback = () => {
					try {
						const area = document.createElement("textarea");
						area.value = text;
						area.setAttribute("readonly", "");
						area.style.position = "fixed";
						area.style.opacity = "0";
						document.body.appendChild(area);
						area.select();
						document.execCommand("copy");
						document.body.removeChild(area);
						done();
					} catch {
						setResult({ status: "error", text: "复制失败，请手动选择复制" });
					}
				};
				const clipboard = navigator.clipboard;
				if (clipboard === undefined || typeof clipboard.writeText !== "function") {
					fallback();
					return;
				}
				clipboard.writeText(text).then(done, fallback);
			}, [menu]);

			/**
			* Look the selection up in the bundled dictionary.
			*
			* This never calls a model, so it is fast and free — the reason it is a
			* separate button from the AI translation rather than a fallback for it.
			*/
			const onDictionary = React.useCallback(async () => {
				if (menu === null) return;
				setResult({ status: "dictionary-loading" });
				try {
					const entry = await requestDictionary(menu.selected);
					setResult(entry === null ? { status: "dictionary-missing" } : { status: "dictionary", entry });
				} catch (error) {
					setResult({ status: "error", text: error instanceof Error ? error.message : String(error) });
				}
			}, [menu]);

			const onTranslate = React.useCallback(async () => {
				if (menu === null) return;
				setResult({ status: "loading" });
				try {
					const answer = await requestTranslation({
						selected: menu.selected,
						before: menu.before,
						after: menu.after,
						sessionId: sessionIdRef.current
					});
					setResult({
						status: "ready",
						text: answer.translation,
						cached: answer.cached === true,
						source: answer.source,
						usage: answer.usage
					});
				} catch (error) {
					setResult({ status: "error", text: error instanceof Error ? error.message : String(error) });
				}
			}, [menu]);

			const onSpeak = React.useCallback(() => {
				if (menu === null) return;
				// The button is a toggle: while speaking it stops, otherwise it starts.
				if (speaking) {
					stopSpeaking();
					setSpeaking(false);
					return;
				}
				const failure = speakEnglish(menu.selected, volume, voiceName, () => {
					// Clear the speaking state once the utterance settles on its own
					// (or fails), so the button returns to "朗读".
					setSpeaking(false);
				});
				if (failure === null) setSpeaking(true);
				else setResult({ status: "error", text: failure });
			}, [menu, volume, voiceName, speaking]);

			const onVolume = React.useCallback((event) => {
				const next = Number(event.target.value);
				if (!Number.isFinite(next)) return;
				const clamped = Math.min(1, Math.max(0, next));
				setVolume(clamped);
				storeVolume(clamped);
			}, []);

			const onVoice = React.useCallback((event) => {
				const next = String(event.target.value);
				setVoiceName(next);
				storeVoice(next);
			}, []);

			if (menu === null) return null;

			/**
			* Place the card so it fits the viewport.
			*
			* The card's real size is measured in a layout effect and re-applied on the
			* next commit, so a long translation is repositioned rather than allowed to
			* run off the bottom of the screen. Before the first measurement the CSS
			* `max-height` already keeps it inside the viewport, so the pre-measurement
			* frame cannot overflow either.
			*/
			const cardWidth = cardSize.width > 0 ? cardSize.width : 320;
			const cardHeight = cardSize.height > 0 ? cardSize.height : 160;
			const left = Math.max(8, Math.min(menu.x, window.innerWidth - cardWidth - 8));
			const top = Math.max(8, Math.min(menu.y, window.innerHeight - cardHeight - 8));

			const children = [];

			/**
			* Echo the selection only when it reads as a word or short phrase.
			* A paragraph-long selection is already visible behind the menu, and
			* repeating it would push the two actions off the screen.
			*/
			if (menu.selected.length <= SELECTION_ECHO_MAX_CHARS) {
				children.push(
					React.createElement(
						"div",
						{ key: "term", className: "dsh-wt-term" },
						React.createElement("span", { className: "dsh-wt-term-label" }, "选中"),
						menu.selected
					)
				);
			}

			const actions = [
				// Copy leads the list: replacing the browser's own menu removed the
				// system Copy item, so this is the only way to copy a selection.
				React.createElement(
					"button",
					{ key: "copy", type: "button", className: "dsh-wt-item", onClick: onCopy },
					result?.status === "copied" ? "已复制" : "复制"
				),
				React.createElement(
					"button",
					{
						key: "dictionary",
						type: "button",
						className: "dsh-wt-item",
						disabled: result?.status === "loading",
						onClick: onDictionary
					},
					result?.status === "dictionary-loading" ? "查询中…" : "词典"
				),
				React.createElement(
					"button",
					{
						key: "translate",
						type: "button",
						className: "dsh-wt-item",
						disabled: result?.status === "loading",
						onClick: onTranslate
					},
					result?.status === "loading" ? "翻译中…" : "AI 翻译"
				),
				React.createElement(
					"button",
					{ key: "speak", type: "button", className: "dsh-wt-item", onClick: onSpeak },
					speaking ? "停止朗读" : "朗读"
				),
				// The volume slider sits with the action it controls. A range input
				// needs `onClick` stopped so dragging the thumb does not read as an
				// outside press and dismiss the menu.
				React.createElement(
					"div",
					{
						key: "volume",
						className: "dsh-wt-volume",
						onClick: (event) => event.stopPropagation()
					},
					React.createElement("span", { className: "dsh-wt-volume-label" }, "音量"),
					React.createElement("input", {
						type: "range",
						min: "0",
						max: "1",
						step: "0.05",
						value: volume,
						onChange: onVolume,
						"aria-label": "朗读音量",
						className: "dsh-wt-volume-input"
					}),
					React.createElement(
						"span",
						{ className: "dsh-wt-volume-value" },
						`${String(Math.round(volume * 100))}%`
					)
				)
			];

			// The controls form one non-shrinking block so the answer below them
			// absorbs all the height pressure.
			children.push(
				React.createElement("div", { key: "actions", className: "dsh-wt-actions" }, actions)
			);

			// Voice choice, offered only when the browser reports more than one
			// English voice — a single-option picker would be noise.
			if (voices.length > 1) {
				children.push(
					React.createElement(
						"div",
						{
							key: "voice",
							className: "dsh-wt-volume",
							onClick: (event) => event.stopPropagation()
						},
						React.createElement("span", { className: "dsh-wt-volume-label" }, "语音"),
						React.createElement(
							"select",
							{
								value: voiceName === "" ? voices[0].name : voiceName,
								onChange: onVoice,
								"aria-label": "朗读语音",
								className: "dsh-wt-voice-select"
							},
							voices.map((voice) =>
								React.createElement(
									"option",
									{ key: voice.name, value: voice.name },
									`${voice.name} (${voice.lang})`
								)
							)
						)
					)
				);
			}

			// A "speaking…" line is deliberately NOT rendered: the speak button
			// itself shows the state by reading "停止朗读" while audio plays, so a
			// second indicator would just take up room. The same goes for "copied",
			// which the copy button already reports by relabelling itself.
			if (result?.status === "dictionary") {
				children.push(React.createElement(DictionaryCard, { key: "result", entry: result.entry }));
			} else if (result?.status === "dictionary-missing") {
				children.push(
					React.createElement(
						"div",
						{ key: "result", className: "dsh-wt-result dsh-wt-meta" },
						"内置词典没有收录这个词。可以用「AI 翻译」。"
					)
				);
			} else if (
				result !== null &&
				result.status !== "loading" &&
				result.status !== "dictionary-loading" &&
				result.status !== "copied"
			) {
				children.push(
					React.createElement(
						"div",
						{
							key: "result",
							className: result.status === "error" ? "dsh-wt-result dsh-wt-result-error" : "dsh-wt-result"
						},
						result.text,
						result.status === "ready" && result.cached === true
							? React.createElement(
								"span",
								{ className: "dsh-wt-meta" },
								result.source === "history" ? "来自记录" : "缓存"
							)
							: null,
						result.status === "ready" && result.cached !== true && result.usage !== undefined
							? React.createElement(
								"span",
								{ className: "dsh-wt-meta" },
								`本次翻译使用 ${result.usage.totalTokens} token（输入 ${result.usage.inputTokens} / 输出 ${result.usage.outputTokens}）`
							)
							: null
					)
				);
			}

			return React.createElement(
				"div",
				{
					ref: rootRef,
					className: "dsh-wt-root",
					style: { left: `${String(left)}px`, top: `${String(top)}px` },
					role: "menu"
				},
				children
			);
		}

		/** Required client service: the slot registry this entry renders through. */
		const inject = ["slots"];

		/**
		* Register the selection menu and the history panel.
		*
		* Each registration is guarded separately so a slot-API change in one degrades
		* to a single console error instead of failing the plugin roster and raising
		* the red boot banner. The Host half keeps working either way.
		*
		* The session whose model a translation uses arrives as the standard
		* `useSessions` prop the overlay owner already binds, so the menu needs no
		* injection face of its own. The panel needs none either: it reads and writes
		* through the Host routes.
		*
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			try {
				ctx.slots.inject("shell.overlay", () =>
					ctx.slots.register(
						{
							name: "shell.overlay",
							id: MENU_CELL_ID,
							order: 50
						},
						SelectionMenu
					)
				);
			} catch (error) {
				console.error("[dsh-word-translate] selection menu failed to register (host half unaffected):", error);
			}

			/**
			* The history viewer is an OVERLAY, not a `main` panel.
			*
			* It was originally registered as a `main` entry plus a `sidebar.panellist`
			* icon, which was a design error with a severe consequence: the conversation
			* (and its composer) is rendered INSIDE the `main` slot under the
			* `conversation` key, and selecting a different key unmounts it. Clicking the
			* icon therefore replaced the whole conversation with the record list and
			* left the composer unusable, with no sidebar row to get back — the
			* conversation is the `activePanelId === null` default, not a row of its own.
			*
			* An overlay floats above the frame without touching `main`, so the
			* conversation is never unmounted and closing the viewer simply reveals it.
			*/
			try {
				ctx.slots.inject("shell.overlay", () =>
					ctx.slots.register(
						{
							name: "shell.overlay",
							id: HISTORY_CELL_ID,
							order: 60
						},
						HistoryOverlay
					)
				);
			} catch (error) {
				console.error("[dsh-word-translate] history overlay failed to register (host half unaffected):", error);
			}

			/**
			* The sidebar row, placed directly under the shipped Plugins row.
			*
			* `order` sorts the list ascending and the Plugins row registers `order: 0`
			* (as does the task manager at `order: 10`), so a small positive order lands
			* this immediately below Plugins without displacing anything.
			*
			* The label is a plain string: the sidebar turns it into the visible text,
			* the accessible name and the collapsed tooltip. It resolves through
			* `resolveSlotLabel`, so a string is exactly what is wanted here — a locale
			* function would need a locale namespace this plugin does not register.
			*
			* No `main` entry is registered for this id, by design: the row opens the
			* overlay, and `HistorySidebarRow` stops the click that would otherwise ask
			* for a panel that does not exist.
			*/
			try {
				ctx.slots.inject("sidebar.panellist", () =>
					ctx.slots.register(
						{
							name: "sidebar.panellist",
							id: HISTORY_ROW_ID,
							order: 1,
							label: HISTORY_ROW_LABEL
						},
						HistorySidebarRow
					)
				);
			} catch (error) {
				console.error("[dsh-word-translate] history sidebar row failed to register (host half unaffected):", error);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = "dsh-word-translate-client";
		return module.exports;
	}
});
