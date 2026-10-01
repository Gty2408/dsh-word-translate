/**
 * Host half of `dsh-word-translate`.
 *
 * Owns three capabilities, all reachable only from this machine's own web origin:
 *
 * - **Dictionary** (`/dictionary`): a lookup in the bundled ECDICT-derived
 *   dictionary. Costs no model call and no network request.
 * - **Translation** (`/translate`): asks the model the current session is already
 *   using for the best Chinese rendering of the selection *in its context*. The
 *   call goes through `ctx.llm.stream` (the same auxiliary-call path session
 *   titles use) and never writes to the session log — a translation is a side
 *   query, not a conversation turn.
 * - **History** (`/history`): the durable record of past translations, which also
 *   serves as the persistent cache.
 *
 * The browser half owns the menu, the selection capture, and speech synthesis;
 * this half owns the dictionary data, the model call, and persistence.
 *
 * @module dsh-word-translate
 */

import { lookupWord, dictionarySize } from './dictionary.js';
import { openHistory } from './history.js';

/** Loopback-only route the browser half posts a translation request to. */
export const TRANSLATE_PATH = '/plugins/dsh-word-translate/translate';

/** Loopback-only route serving bundled-dictionary lookups (no model call). */
export const DICTIONARY_PATH = '/plugins/dsh-word-translate/dictionary';

/** Loopback-only route serving the translation history. */
export const HISTORY_PATH = '/plugins/dsh-word-translate/history';

/** Bound on the auxiliary model call, in milliseconds. */
const TRANSLATE_TIMEOUT_MS = 45_000;

/**
 * Cap on the translation output, in tokens.
 *
 * This budget covers the model's REASONING as well as the answer, and a
 * reasoning model spends an unpredictable share on thinking before it writes
 * anything. A one-word translation needs a handful of tokens, so the budget is
 * set far above the answer's needs and left to absorb the reasoning: a tight
 * budget does not make the call cheaper, it makes the answer start later or not
 * at all.
 */
const MAX_OUTPUT_TOKENS = 8_192;

/**
 * How many times one translation may be attempted before it is reported as failed.
 *
 * A retry is consumed both by an outright error and by a fragment (see
 * `looksTruncated`), and the model produced a fragment in 3 of 6 live long-phrase
 * attempts — so two attempts would still return a fragment roughly a quarter of
 * the time. Four keeps the worst case bounded while making a truncated answer
 * uncommon. Each attempt is a side-channel call that does not touch the session
 * log, and token usage is summed across all of them.
 */
const TRANSLATE_ATTEMPTS = 4;

/**
 * How long a successful translation stays reusable, in milliseconds.
 *
 * The same word in the same sentence is worth re-reading and not worth
 * re-translating: the model call is slow, costs tokens, and — because the model
 * decides how much to think each time — is not perfectly repeatable. A short
 * window covers "look at it again while reading on" without serving a stale
 * answer after the surrounding text has changed (the context is part of the key,
 * so an edited sentence is a different entry anyway).
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Maximum cached translations retained; the least recently used is evicted. */
const CACHE_MAX_ENTRIES = 200;

/**
 * Recently successful translations, keyed by the exact request that produced
 * them.
 *
 * One instance is created per plugin activation and closed over by the route
 * handler, so the cache lives exactly as long as the fiber that owns it: a
 * reload starts empty, and no state outlives the plugin. A `Map` iterates in
 * insertion order, so re-inserting on a hit makes the first key the least
 * recently used and eviction a single step.
 */
function createTranslationCache() {
  const entries = new Map();
  return {
    /**
    * Read one cached translation, refreshing its recency.
    * @param key - cache key.
    * @param now - current time.
    * @returns the entry, or undefined when absent or expired.
    */
    get(key, now) {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (now - entry.at > CACHE_TTL_MS) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry;
    },
    /**
    * Store one successful translation, evicting expired and overflow entries.
    * @param key - cache key.
    * @param value - the translation and the usage that produced it.
    * @param now - current time.
    */
    set(key, value, now) {
      entries.delete(key);
      entries.set(key, { ...value, at: now });
      for (const [candidate, entry] of entries) {
        if (entries.size <= CACHE_MAX_ENTRIES && now - entry.at <= CACHE_TTL_MS) break;
        entries.delete(candidate);
      }
    },
    /**
    * Drop one entry.
    *
    * Deleting a history record MUST also drop it here. Otherwise a re-translation
    * of the same text would be served from this cache, the record would never be
    * re-created, and the history panel would stay empty despite a successful
    * translation — the deleted entry would look permanently lost.
    *
    * @param key - cache key.
    */
    forget(key) {
      entries.delete(key);
    },
    /** Drop every entry; used when the whole history is cleared. */
    clear() {
      entries.clear();
    },
  };
}

/** Build the cache key for one request: context is part of the identity. */
function cacheKeyOf(request) {
  return `${request.selected}\u0000${request.before}\u0000${request.after}`;
}

/**
 * This plugin deliberately does NOT send a `reasoningEffort`.
 *
 * An earlier revision asked for the cheapest tier the model advertised, on the
 * theory that a translation needs no deliberation. Measured against the live
 * model that made results WORSE: correct terms came back shorter and truncated
 * more often. The cheap tier is not a cheaper version of the same answer, it is
 * a different and lazier one. The model therefore keeps whatever effort its own
 * configuration selects, and the token budget absorbs the reasoning.
 */

/**
 * Sampling temperature for the translation call.
 *
 * A translation has one right answer, so greedy decoding is the right default.
 * Measured against the live model this did NOT on its own make the output
 * deterministic — the remaining variance is in how much the model reasons, not
 * in how it samples — so this is a mild improvement rather than the fix. The
 * reconciliation in {@link reconcileAnswer} is what removes the visible
 * inconsistency.
 */
const TEMPERATURE = 0;

/** Cap on any single text field accepted from the browser half, in characters. */
const MAX_FIELD_CHARS = 4_000;

/**
 * System instruction for the contextual translation call.
 *
 * The wording is deliberate. The selection is EITHER a word/phrase OR a whole
 * passage, and the model must translate ALL of it: an earlier revision called it
 * a "selected term" throughout, and the model obeyed literally — a 227-character
 * multi-sentence selection came back as a 14-character translation of just its
 * first clause. The prompt therefore says "selection", states the whole thing must
 * be translated, and says explicitly that length is never a reason to shorten it.
 *
 * The surrounding text stays CONTEXT: it disambiguates the selection but is not
 * itself translated. Output is constrained to the translation alone so the caller
 * can render it verbatim without stripping a preamble.
 */
const SYSTEM_PROMPT = [
  'You translate selected English text into Chinese.',
  'The selection may be a single word, a phrase, or one or more whole sentences.',
  'You are given the surrounding text as context. Use it to pick the right sense of the selection, but translate ONLY the selection, not the surrounding text.',
  'Rules:',
  '- Translate the ENTIRE selection, from its first word to its last. Never translate only the first sentence, the first clause, or a summary.',
  '- Length is never a reason to shorten: a long selection gets a long translation. If the selection contains several sentences, the translation contains several sentences.',
  '- Reply with the Chinese translation ONLY: no quotes, no pinyin, no explanation, no Markdown, no added notes.',
  '- Translate the WHOLE selection even when it is short. A one-character answer is wrong whenever the text needs more: the React term "mount" is 挂载, not 挂.',
  '- Prefer the standard established Chinese term for a technical or domain concept.',
  '- If the context gives the text a specific sense, choose the translation for THAT sense.',
  '- If the selection is already Chinese, answer with it unchanged.',
].join('\n');

/**
 * Build the user-role frame for one translation request.
 *
 * The three parts travel as JSON so that selected or surrounding text containing
 * the delimiters cannot break the structure.
 * @param request - validated selection and context.
 * @returns the framed user text.
 */
function frameRequest(request) {
  const sentences = request.selected.trim().split(/[.!?]+\s/u).filter((part) => part.length > 0).length;
  return [
    'Translate the entire selected text into Chinese, using the surrounding context to pick the right sense.',
    sentences > 1
      ? `The selection is ${String(sentences)} sentences long — translate all of them, not a summary.`
      : 'Translate the whole selection.',
    JSON.stringify({
      before: request.before,
      selected: request.selected,
      after: request.after,
    }),
  ].join('\n');
}

/** Coerce an untrusted value into a bounded string. */
function asText(value) {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_CHARS) : '';
}

/**
 * Validate one untrusted browser payload.
 * @param raw - parsed JSON body.
 * @returns the validated request, or an error message.
 */
function validateRequest(raw) {
  if (raw === null || typeof raw !== 'object') return { error: 'body must be a JSON object' };
  const selected = asText(raw.selected).trim();
  if (selected.length === 0) return { error: 'selected text is required' };
  return {
    value: {
      selected,
      before: asText(raw.before),
      after: asText(raw.after),
    },
  };
}

/**
 * Resolve the provider/model pair one session is currently using.
 *
 * Preference order, most specific first:
 * 1. the session's own durable model selection — the projection the composer's
 *    model selector writes (`pending` is a switch that has not been used yet,
 *    `lastUsed` is what the session actually last sent);
 * 2. the last request header the session actually sent;
 * 3. the deployment default.
 *
 * Every step is guarded: a session may be cold, and the plugin must degrade to
 * the default rather than fail the request.
 *
 * @param ctx - plugin context exposing `agents`, `sessionProjections`, and `agentDefaultModel`.
 * @param sessionId - session to resolve a route for, when known.
 * @returns the resolved route, or undefined when no route can be resolved.
 */
function resolveRoute(ctx, sessionId) {
  const isRoute = (value) =>
    typeof value?.provider === 'string' &&
    value.provider.length > 0 &&
    typeof value?.model === 'string' &&
    value.model.length > 0;

  if (sessionId !== undefined) {
    try {
      const session = ctx.get('agents')?.get(sessionId)?.session;
      if (session !== undefined) {
        const selection = ctx.get('sessionProjections')?.stateOf?.(session, 'modelSelection');
        const candidate = selection?.pending ?? selection?.lastUsed;
        if (isRoute(candidate)) return { provider: candidate.provider, model: candidate.model };

        const config = session.requestHeader?.()?.config;
        if (isRoute(config)) return { provider: config.provider, model: config.model };
      }
    } catch {
      // A cold or concurrently-disposed session must not fail the translation.
    }
  }

  try {
    const fallback = ctx.get('agentDefaultModel')?.currentSelection?.();
    if (isRoute(fallback)) return { provider: fallback.provider, model: fallback.model };
  } catch {
    // Fall through to "no route".
  }
  return undefined;
}

/** Read one JSON request body with a byte bound. */
async function readJsonBody(req, limitBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Write one JSON response. */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/**
 * Accept browser origins that are loopback only.
 *
 * The route reaches a model call, so it is refused to any other origin; a
 * request with no Origin header (a same-origin form post or a local tool) is
 * allowed, mirroring the shipped plugin-route convention.
 * @param req - incoming request.
 * @returns whether the origin is acceptable.
 */
function isLoopbackOrigin(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

/** Strip the surrounding quotes and code fences a model may still add. */
function normalizeTranslation(text) {
  let value = text.trim();
  value = value.replace(/^```[a-zA-Z]*\s*/u, '').replace(/```$/u, '').trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === '“' && last === '”') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim();
    }
  }
  return value;
}

/** Turn a terminal finish chunk into an error, or undefined when the call succeeded. */
function finishError(finish) {
  switch (finish?.kind) {
    case undefined:
    case 'stop':
      return undefined;
    case 'error':
    case 'aborted':
      return new Error(finish.failure?.message ?? 'the model call did not complete');
    case 'max-tokens':
      return new Error('the translation reached the output token limit');
    case 'tool-calls':
      return new Error('the model unexpectedly requested a tool');
    default:
      return new Error(`unsupported finish reason "${String(finish.kind)}"`);
  }
}

/**
 * Pull the answer the model named in its reasoning text.
 *
 * The LAST answer-shaped phrase wins: a model reasons toward its conclusion, so
 * an early "…could be 挂 or 挂载…" is deliberation and the final "= 挂载" is the
 * decision.
 *
 * @param reasoning - concatenated reasoning text.
 * @returns the named answer, or an empty string when none is found.
 */
function translationFromReasoning(reasoning) {
  const run = '[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff]+';
  const patterns = [
    new RegExp(`(?:means|is|translates? to|equals|answer\\s*[:：]|[:：=])\\s*[「『"']?(${run})`, 'gu'),
    new RegExp(`(?:翻译|译)[为成作是]\\s*[「『"']?(${run})`, 'gu'),
  ];
  let found = '';
  for (const pattern of patterns) {
    for (const match of reasoning.matchAll(pattern)) {
      if (match[1] !== undefined && match[1].length > 0) found = match[1];
    }
  }
  return found;
}

/**
 * Chinese characters that cannot end a translation.
 *
 * A text block ending in one of these is a sentence fragment, not an answer:
 * captured from the live adapter, the model emitted `一键重启按钮被` and stopped.
 * `被` (a passive marker) can never close a Chinese sentence, so its presence at
 * the end is positive evidence of truncation — unlike a character such as 置,
 * which closes a perfectly good word like 配置.
 */
const NON_TERMINAL_CHARS = new Set([
  '\u88ab', '\u628a', '\u5c06', '\u5230', '\u4e3a', '\u548c', '\u4e0e', '\u6216',
  '\u5bf9', '\u4ece', '\u5411', '\u7ed9', '\u8ba9', '\u4f7f', '\u800c', '\u4e14',
  '\u56e0', '\u4ee5', '\u4f46', '\u5374', '\u5219', '\u4e4b', '\u5176', '\u8be5',
  '\u6b64', '\u8fd9', '\u90a3', '\u4eec', '\u4e0d', '\u6ca1', '\u5f88', '\u592a',
  '\u66f4', '\u6700', '\u4f1a', '\u80fd', '\u8981', '\u53ef', '\u9700', '\u5e94',
  '\u7b49', '\u5f97', '\u7740', '\u8fc7', '\u4e8e',
]);

/**
 * Chinese words that cannot END a translation.
 *
 * These are modifiers that oblige a following word: `故意` (deliberately) and
 * `有意` (intentionally) modify a verb, so a translation stopping at one is
 * incomplete. Captured from the live adapter, the model emitted
 * `一键重启按钮被故意` and stopped — the last character 意 is unremarkable, so only
 * the WORD reveals the truncation.
 */
const NON_TERMINAL_WORDS = ['\u6545\u610f', '\u6709\u610f', '\u523b\u610f', '\u7ecf\u5e38', '\u5df2\u7ecf'];

/**
 * Does this text look like it was cut off mid-sentence?
 *
 * A one-character answer counts as a fragment on its own: a single Chinese
 * character is very rarely a complete translation of an English word, and the
 * live adapter produced exactly that (`挂` beside a reasoning stating `挂载`).
 *
 * For longer text two tests apply: the final character must not be a particle
 * that cannot close a sentence (`一键重启按钮被`), and the text must not end on a
 * modifier that obliges a following verb (`一键重启按钮被故意`). A character such as
 * 置 can close a real word (配置), so a longer answer is never condemned merely
 * for ending in a common character.
 *
 * @param text - the normalized answer.
 * @returns true when the text reads as an incomplete fragment.
 */
function looksTruncated(text) {
  if (text.length === 0) return false;
  if (text.length === 1) return true;
  if (NON_TERMINAL_WORDS.some((word) => text.endsWith(word))) return true;
  if (text.length < 4) return false;
  return NON_TERMINAL_CHARS.has(text.slice(-1));
}

/**
 * Is this answer implausibly short for the English it translates?
 *
 * The strongest truncation signal is a length mismatch, and it catches two
 * different failures the other tests miss.
 *
 * A short answer for a multi-word phrase: the live adapter answered the
 * seven-word "the one-click restart button is deliberately disabled" with `一键`
 * (2 characters) and stopped. Such an answer ends in an unremarkable character,
 * so {@link looksTruncated} cannot see it.
 *
 * A short answer for a long passage: the model answered a 227-character,
 * multi-sentence selection with `已验证可用，而不仅仅是已安装` (14 characters),
 * having translated only its first clause. Sentence count alone does not reveal
 * this, but the collapse in length does.
 *
 * The test stays loose because Chinese is compact and a good translation is
 * often much shorter than its English. It flags only a clear mismatch, and a
 * short selection (a word or two) is never judged this way, so a legitimate brief
 * answer such as `挂载` for "mount" is untouched.
 *
 * @param text - the normalized answer.
 * @param source - the selected English text.
 * @returns true when the answer is too short to be a real translation.
 */
function looksTooShort(text, source) {
  const trimmed = source.trim();
  const words = trimmed.split(/\s+/u).filter((word) => word.length > 0).length;
  if (words < 4) return false;
  // A phrase of four or more words cannot be carried by a couple of characters.
  if (text.length < Math.min(6, words)) return true;
  // A long passage cannot collapse into a small fraction of itself. Chinese runs
  // well under half the character count of its English for technical prose, so a
  // floor of 15% is conservative: it catches a first-clause-only answer without
  // condemning a legitimately terse one.
  if (trimmed.length >= 80) return text.length < trimmed.length * 0.15;
  return false;
}

/**
 * Collect every Chinese answer the reasoning offers as a candidate.
 *
 * Candidates carry a `marked` flag. A MARKED candidate is one the reasoning
 * introduced as its answer (`Final: X`, `Answer: X`, `= X`, `翻译为X`); an
 * unmarked one is merely a Chinese sentence that appears in the reasoning. The
 * distinction is what keeps the repair honest: a marked answer may extend the
 * text block, while an unmarked sentence may only do so when the text block is
 * visibly broken (see {@link reconcileAnswer}).
 *
 * The net must be broad because the model does not reliably mark its answer.
 * Captured from the live adapter, a truncated text block `一键重启按钮被` sat
 * beside a reasoning that ended `I'll go with 一键重启按钮被有意禁用.` — a
 * complete answer carrying no marker at all, so a marker-only extractor found
 * nothing and the truncation survived.
 *
 * Candidates come back longest-first, so a caller repairing a truncated block
 * sees the most complete reading before any shorter restatement.
 *
 * @param reasoning - concatenated reasoning text.
 * @returns distinct candidates, longest first, each `{ text, marked }`.
 */
function answerCandidates(reasoning) {
  const run = '[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff]';
  const body = `${run}[\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\s\\u3001\\uff0c]*`;
  const quote = '[\\u300c\\u300e"\'`]?';
  /** Marked answers: an explicit conclusion or equation. */
  const markedPatterns = [
    new RegExp(
      `(?:final|answer|result|\\u6700\\u7ec8|\\u7b54\\u6848|\\u8bd1\\u6587)\\s*[:\\uff1a]\\s*${quote}(${body}${run})`,
      'giu',
    ),
    new RegExp(`=\\s*${quote}(${body}${run})`, 'gu'),
    new RegExp(`(?:\\u7ffb\\u8bd1|\\u8bd1)[\\u4e3a\\u6210]\\s*${quote}(${body}${run})`, 'gu'),
  ];
  /** Unmarked Chinese sentences, used only to repair a visibly broken block. */
  const sentencePatterns = [
    // A quoted passage, with or without its closing period.
    new RegExp(`${quote}(${body}${run})[\\u3002\\uff01\\uff1f.!?]?`, 'gu'),
    // A bare sentence ending in a period.
    new RegExp(`(${body}${run})[\\u3002\\uff01\\uff1f]`, 'gu'),
  ];

  const found = new Map();
  const collect = (patterns, marked) => {
    for (const pattern of patterns) {
      for (const match of reasoning.matchAll(pattern)) {
        const text = match[1]?.replace(/\s+/gu, '').trim();
        if (text === undefined || text.length === 0) continue;
        const existing = found.get(text);
        // A marked reading of the same text upgrades an unmarked one.
        if (existing === undefined || (marked && !existing.marked)) found.set(text, { text, marked });
      }
    }
  };
  collect(markedPatterns, true);
  collect(sentencePatterns, false);

  return [...found.values()].sort((left, right) => right.text.length - left.text.length);
}

/**
 * Reconcile the answer block with the answer the reasoning offered.
 *
 * `deepseek-v4.1-flash` intermittently emits a TRUNCATED answer block while its
 * own reasoning holds the complete answer. Captured from the live adapter:
 *
 * ```
 * TEXT:   '一键重启按钮被'                                   (cut off)
 * REASON: '… I'll go with 一键重启按钮被有意禁用.'            (complete)
 * ```
 *
 * ```
 * TEXT:   '挂'
 * REASON: '… "mount" = 挂载.'
 * ```
 *
 * Repair happens ONLY on positive evidence that the block was cut off, because a
 * longer candidate that merely starts with the text is not proof of anything:
 * `配置` is a complete answer that happens to be a prefix of the mentioned
 * `配置文件`, and extending it would introduce a new error rather than fix one.
 *
 * A longer candidate is therefore accepted when either:
 *
 * - the text is a prefix of an answer the reasoning MARKED as its conclusion
 *   (`Final:`, `Answer:`, `= X`, `翻译为X`), or
 * - the text itself reads as a fragment (see {@link looksTruncated}) — a
 *   one-character answer, or one ending in a character that cannot end a sentence.
 *
 * In every other case the text block wins, because that is where the protocol
 * puts the answer.
 *
 * @param text - the answer text block.
 * @param reasoning - the reasoning text.
 * @returns the translation to return.
 */
function reconcileAnswer(text, reasoning) {
  const fromText = normalizeTranslation(text);
  const candidates = answerCandidates(reasoning);
  if (fromText.length === 0) {
    // No answer block at all: a MARKED answer is the answer; only fall back to an
    // unmarked sentence when the reasoning marked nothing. The longest sentence is
    // usually deliberation, not the answer.
    const marked = candidates.find((candidate) => candidate.marked);
    if (marked !== undefined) return marked.text;
    return candidates.length > 0 ? candidates[0].text : translationFromReasoning(reasoning);
  }

  /**
  * Repair the text block only on positive evidence that it was cut off.
  *
  * A longer candidate that merely starts with the text is NOT enough — `配置` is a
  * complete answer that happens to be a prefix of the mentioned `配置文件`, and
  * extending it would be a new error rather than a repair. So a longer candidate
  * is accepted only when the text is a marked answer's prefix, or when the text
  * itself ends in a character that cannot end a sentence (`一键重启按钮被`).
  */
  const truncated = looksTruncated(fromText);
  for (const candidate of candidates) {
    if (candidate.text.length <= fromText.length || !candidate.text.startsWith(fromText)) continue;
    if (candidate.marked || truncated) return candidate.text;
  }
  return fromText;
}

/**
 * Run ONE translation attempt.
 *
 * The message is a plain `RequestUserInput` — a user-role value with content and
 * no identity — which is exactly the shape a hand-built (non-loop) request uses,
 * so this half needs no imports from the LLM package and cannot drift with it.
 *
 * No `reasoningEffort` is sent: the model's own configured effort is what
 * produces a complete answer (see the note above the attempt policy).
 *
 * @param ctx - plugin context exposing `llm`.
 * @param llm - the resolved llm service.
 * @param route - provider/model pair to call.
 * @param request - validated selection and context.
 * @param sessionId - session the request came from, for attribution only.
 * @param signal - caller cancellation.
 * @returns the translation text.
 * @throws when the attempt produced no usable answer.
 */
async function translateOnce(ctx, llm, route, request, sessionId, signal) {
  const messages = [
    {
      role: 'user',
      content: [{ type: 'text', text: frameRequest(request) }],
    },
  ];

  const deadline = new AbortController();
  const onAbort = () => deadline.abort();
  if (signal !== undefined) {
    if (signal.aborted) deadline.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => deadline.abort(), TRANSLATE_TIMEOUT_MS);

  try {
    /**
    * Text collected per block index. `block-end` carries the adapter's own
    * finalized content, so it OVERWRITES the deltas accumulated for that index —
    * that makes the assembled text authoritative rather than a re-derivation of
    * the same thing. Ordering by index keeps multiple text blocks in stream order.
    */
    const textByIndex = new Map();
    const reasoningByIndex = new Map();
    let finish;
    let usage;
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      messages,
      system: SYSTEM_PROMPT,
      maxTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      ...(sessionId === undefined ? {} : { sessionId }),
      signal: deadline.signal,
    })) {
      if (chunk.type === 'text-delta') {
        textByIndex.set(chunk.index, (textByIndex.get(chunk.index) ?? '') + chunk.text);
      } else if (chunk.type === 'block-end' && chunk.block?.type === 'text') {
        textByIndex.set(chunk.index, chunk.block.text);
      } else if (chunk.type === 'reasoning-delta') {
        reasoningByIndex.set(chunk.index, (reasoningByIndex.get(chunk.index) ?? '') + chunk.text);
      } else if (chunk.type === 'block-end' && chunk.block?.type === 'reasoning') {
        reasoningByIndex.set(chunk.index, chunk.block.text);
      } else if (chunk.type === 'usage') {
        usage = chunk.usage;
      } else if (chunk.type === 'finish') {
        finish = chunk.reason;
      }
    }

    const joined = (byIndex) =>
      [...byIndex.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([, text]) => text)
        .join('');

    const streamed = joined(textByIndex);

    /**
    * A token-limit stop means the answer was CUT OFF mid-word, and a partial
    * Chinese translation is a wrong translation: "mount" truncated to "挂" reads
    * as a complete (and incorrect) answer, which is worse than reporting failure.
    * The retry below is what recovers this case.
    */
    const failure = finishError(finish);
    if (failure !== undefined) throw failure;

    const reasoning = joined(reasoningByIndex);
    const translation = reconcileAnswer(streamed, reasoning);
    if (translation.length === 0) throw new Error('模型没有返回译文');

    /**
    * Report whether the answer still looks cut off.
    *
    * A longer sentence in the reasoning that starts with the answer is evidence of
    * truncation, but only for a PHRASE source: a single English word is fully
    * translated by a short answer, so `配置` for "profile" must not be second-guessed
    * merely because the reasoning also mentioned `配置文件`. For a multi-word phrase
    * the same evidence is meaningful, and it catches the mid-length case the other
    * tests miss: the model emitted `它能正确检测到该操作具有` and stopped, while its
    * reasoning held the longer `…具有破坏性`.
    */
    const answer = normalizeTranslation(translation);
    const sourceWords = request.selected.trim().split(/\s+/u).filter((word) => word.length > 0).length;
    const unclaimed = answerCandidates(reasoning).some(
      (candidate) => candidate.text.length > answer.length && candidate.text.startsWith(answer),
    );
    const suspect = sourceWords >= 4 && unclaimed;
    return { translation, usage, suspect };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Translate one selection, retrying a failed attempt once.
 *
 * The model is not deterministic about how much it thinks before answering, so
 * the same request can succeed and then fail: an attempt may spend everything on
 * reasoning and never emit text. One retry turns that transient into a success,
 * which is also why a success is cached — the answer is stable, the route to it
 * is not.
 *
 * Token usage is summed across attempts, so a retried translation reports what it
 * actually cost rather than only what the successful attempt cost.
 *
 * @param ctx - plugin context exposing `llm`.
 * @param route - provider/model pair to call.
 * @param request - validated selection and context.
 * @param sessionId - session the request came from, for attribution only.
 * @param signal - caller cancellation.
 * @returns the translation text and its total token usage.
 */
async function translate(ctx, route, request, sessionId, signal) {
  const llm = ctx.get('llm');
  if (llm === undefined) throw new Error('the llm service is unavailable');

  const totals = { inputTokens: 0, outputTokens: 0 };
  let sawUsage = false;
  let lastError;
  /** Best answer seen so far, kept in case every attempt comes back a fragment. */
  let best;
  for (let attempt = 0; attempt < TRANSLATE_ATTEMPTS; attempt += 1) {
    try {
      const result = await translateOnce(ctx, llm, route, request, sessionId, signal);
      if (result.usage !== undefined) {
        sawUsage = true;
        totals.inputTokens += result.usage.inputTokens ?? 0;
        totals.outputTokens += result.usage.outputTokens ?? 0;
      }

      /**
      * A fragment is not a translation, so it does not end the loop.
      *
      * The model sometimes stops mid-answer (`一键重启按钮被`, or `一键` for a
      * seven-word phrase) while the same request answers completely on another
      * attempt, so a fragment is treated like a failure: keep the longest one as a
      * fallback and try again. Only an answer that is neither a fragment nor
      * implausibly short ends the loop.
      */
      const answer = normalizeTranslation(result.translation);
      if (best === undefined || result.translation.length > best.length) best = result.translation;
      if (!result.suspect && !looksTruncated(answer) && !looksTooShort(answer, request.selected)) {
        return {
          translation: result.translation,
          usage: sawUsage ? { ...totals, totalTokens: totals.inputTokens + totals.outputTokens } : undefined,
        };
      }
    } catch (error) {
      lastError = error;
      // A caller cancellation is final: retrying would ignore the request to stop.
      if (signal?.aborted === true) throw error;
    }
  }

  // Every attempt was rejected or errored. The longest rejected answer is still a
  // partial translation, which is more useful than an error message — but a run
  // that produced no usable text at all must report failure rather than serve
  // whatever stray text it happened to emit. The criteria mirror the loop's.
  if (best !== undefined) {
    const answer = normalizeTranslation(best);
    const source = request.selected.trim();
    /**
    * A fragment of a long passage is NOT worth serving.
    *
    * The fallback exists because a partial answer beats an error for a short term:
    * `挂` is a recognisable (if incomplete) rendering of "mount". For a passage the
    * same trade is wrong — a 15-character answer for a 227-character, three-sentence
    * selection is a translation of its first clause, and presenting it as the
    * translation would be actively misleading. So a passage that collapsed is
    * reported as a failure, which the menu shows as an error the user can retry.
    */
    const collapsed = source.length >= 80 && answer.length < source.length * 0.15;
    if (!collapsed && (looksTruncated(answer) || looksTooShort(answer, source))) {
      return {
        translation: best,
        usage: sawUsage ? { ...totals, totalTokens: totals.inputTokens + totals.outputTokens } : undefined,
      };
    }
    if (collapsed) throw new Error('模型只翻译了开头，请重试');
  }
  throw lastError ?? new Error('翻译失败');
}

/**
 * Register every route on the Host web server.
 *
 * All three routes share one gate: they are POST-only, and they reject any request
 * whose Origin is not this machine. The dictionary and history routes carry no
 * credentials and touch no model, but they are still loopback-only because they
 * expose the user's reading history.
 *
 * @param ctx - context whose `webServer` serves the browser.
 */
function registerRoute(ctx) {
  /** Per-activation translation cache; it dies with this fiber. */
  const cache = createTranslationCache();

  /**
  * The durable history, opened lazily.
  *
  * Opening touches the storage backend, so it is deferred until the first request
  * that needs it — a deployment that never translates pays nothing, and an
  * activation that never runs a route never opens a unit.
  */
  let historyPromise;
  const history = () => {
    historyPromise ??= openHistory(ctx);
    return historyPromise;
  };

  /** Shared gate: POST only, from this machine only. */
  const guard = (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method not allowed' });
      return false;
    }
    if (!isLoopbackOrigin(req)) {
      sendJson(res, 403, { error: 'origin-not-trusted' });
      return false;
    }
    return true;
  };

  /** Read and validate the JSON body, answering the error itself on failure. */
  const readBody = async (req, res) => {
    try {
      return { body: await readJsonBody(req) };
    } catch (error) {
      sendJson(res, 400, { error: `invalid request body: ${String(error?.message ?? error)}` });
      return {};
    }
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: DICTIONARY_PATH,
        handler: async (req, res) => {
          if (!guard(req, res)) return;
          const read = await readBody(req, res);
          if (read.body === undefined) return;

          const selected = typeof read.body.selected === 'string' ? read.body.selected : '';
          if (selected.trim().length === 0) {
            sendJson(res, 400, { error: 'selected text is required' });
            return;
          }

          try {
            const entry = await lookupWord(selected);
            if (entry === null) {
              // Not a failure: the word is simply outside the bundled subset.
              sendJson(res, 200, { found: false, words: await dictionarySize() });
              return;
            }
            sendJson(res, 200, { found: true, entry });
          } catch (error) {
            ctx.logger?.warn?.('dsh-word-translate: dictionary lookup failed', error);
            sendJson(res, 500, { error: String(error?.message ?? error) });
          }
        },
      }),
    'dsh-word-translate: dictionary route',
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: HISTORY_PATH,
        handler: async (req, res) => {
          if (!guard(req, res)) return;
          const read = await readBody(req, res);
          if (read.body === undefined) return;

          const action = typeof read.body.action === 'string' ? read.body.action : 'list';
          try {
            const store = await history();
            if (action === 'list') {
              sendJson(res, 200, { durable: store.durable, records: await store.all() });
              return;
            }
            if (action === 'delete') {
              const id = typeof read.body.id === 'string' ? read.body.id : '';
              if (id.length === 0) {
                sendJson(res, 400, { error: 'id is required' });
                return;
              }
              // Read the record first so its own text can evict the matching
              // in-memory cache entry. Deriving the key here rather than trusting
              // the client keeps the two stores from drifting apart.
              const record = (await store.all()).find((item) => item.id === id);
              const removed = await store.forget(id);
              if (removed && record !== undefined) {
                cache.forget(cacheKeyOf(record));
              }
              sendJson(res, 200, { removed });
              return;
            }
            if (action === 'clear') {
              const removed = await store.forgetAll();
              cache.clear();
              sendJson(res, 200, { removed });
              return;
            }
            sendJson(res, 400, { error: `unknown action: ${action}` });
          } catch (error) {
            ctx.logger?.warn?.('dsh-word-translate: history request failed', error);
            sendJson(res, 500, { error: String(error?.message ?? error) });
          }
        },
      }),
    'dsh-word-translate: history route',
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: TRANSLATE_PATH,
        handler: async (req, res) => {
          if (!guard(req, res)) return;
          const read = await readBody(req, res);
          if (read.body === undefined) return;
          const body = read.body;

          const validated = validateRequest(body);
          if (validated.error !== undefined) {
            sendJson(res, 400, { error: validated.error });
            return;
          }

          const sessionId = typeof body.sessionId === 'string' && body.sessionId.length > 0 ? body.sessionId : undefined;
          const route = resolveRoute(ctx, sessionId);
          if (route === undefined) {
            sendJson(res, 409, { error: 'no model route is available for this session' });
            return;
          }

          const abort = new AbortController();
          res.on('close', () => abort.abort());

          /**
          * Serve a repeat lookup from memory, then from the durable history.
          *
          * The in-memory cache is checked first because it is free; the history is
          * the fallback that survives a restart. A hit from either is a hit: the
          * text AND its context are the key, so the sense cannot have changed.
          */
          const key = cacheKeyOf(validated.value);
          const cached = cache.get(key, Date.now());
          if (cached !== undefined) {
            sendJson(res, 200, { translation: cached.translation, cached: true, source: 'memory' });
            return;
          }
          try {
            const store = await history();
            const remembered = await store.find(validated.value);
            if (remembered !== null) {
              // Warm the in-memory cache so the next repeat skips storage too.
              cache.set(key, { translation: remembered.translation, usage: remembered.usage }, Date.now());
              sendJson(res, 200, { translation: remembered.translation, cached: true, source: 'history' });
              return;
            }
          } catch (error) {
            // A history read must never block a translation.
            ctx.logger?.warn?.('dsh-word-translate: history lookup failed', error);
          }

          try {
            const result = await translate(ctx, route, validated.value, sessionId, abort.signal);
            cache.set(key, result, Date.now());
            // Persist the success so the record survives a restart and shows up in
            // the history panel. A storage failure must not fail the translation.
            try {
              const store = await history();
              await store.remember({
                ...validated.value,
                translation: result.translation,
                usage: result.usage,
                model: `${route.provider}/${route.model}`,
              });
            } catch (error) {
              ctx.logger?.warn?.('dsh-word-translate: could not record translation', error);
            }
            sendJson(res, 200, {
              translation: result.translation,
              ...(result.usage === undefined ? {} : { usage: result.usage }),
            });
          } catch (error) {
            ctx.logger?.warn?.('dsh-word-translate: translation failed', error);
            sendJson(res, 502, { error: String(error?.message ?? error) });
          }
        },
      }),
    'dsh-word-translate: translate route',
  );
}

/** Stable plugin name. */
export const name = 'dsh-word-translate';

/**
 * No hard service dependency.
 *
 * The web carrier is attached through `ctx.inject(['webServer'], …)` so a
 * deployment without a browser gets a plugin that registers nothing instead of
 * a fiber that never activates, and `llm` / `agents` / `agentDefaultModel` are
 * probed with `ctx.get()` at request time.
 */
export const inject = [];

/**
 * Install the Host half.
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => registerRoute(webCtx));
}
