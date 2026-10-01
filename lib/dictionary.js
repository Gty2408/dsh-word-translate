/**
 * Bundled English→Chinese dictionary for `dsh-word-translate`.
 *
 * The dictionary is a distilled build of ECDICT (MIT, see `data/NOTICE.md`),
 * shipped as one JSON file. It exists so that the "词典" action costs nothing:
 * no network call, no model tokens, and no dependency on a third-party API —
 * `api.dictionaryapi.dev` is unreachable from the deployment this was built for,
 * which is what ruled an online dictionary out.
 *
 * What makes this worth bundling rather than asking the model is not the
 * translation itself but the STUDY signals ECDICT carries: a Collins star rating,
 * the Oxford-3000 flag, exam tags (cet4/cet6/ky/toefl/ielts/gre/zk/gk) and BNC and
 * COCA frequency ranks. Those answer "is this word worth learning?" — the question
 * a learner actually has, and one a machine translation cannot answer.
 *
 * @module dsh-word-translate/dictionary
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory holding this module; used to locate the bundled data file. */
const HERE = dirname(fileURLToPath(import.meta.url));

/** The bundled dictionary, relative to this module. */
const DICT_PATH = join(HERE, '..', 'data', 'dict.json');

/**
 * Human-readable labels for ECDICT's exam tags.
 *
 * The tags are what make the dictionary a study aid rather than a lookup table,
 * and an unlabelled `cet6` means nothing to most readers.
 */
const TAG_LABELS = {
  zk: '中考',
  gk: '高考',
  cet4: '四级',
  cet6: '六级',
  ky: '考研',
  toefl: '托福',
  ielts: '雅思',
  gre: 'GRE',
};

/**
 * Collins star ratings, as ECDICT stores them.
 *
 * ECDICT encodes 1-5 stars directly, and also uses 1-3 for "core vocabulary"
 * bands; the label is kept generic so either meaning reads sensibly.
 */
const COLLINS_LABELS = {
  1: '柯林斯 1 星',
  2: '柯林斯 2 星',
  3: '柯林斯 3 星',
  4: '柯林斯 4 星',
  5: '柯林斯 5 星',
};

/**
 * Load the bundled dictionary once per process.
 *
 * Loading is memoised because the file is a few megabytes: a lookup is expected
 * to be instant, and re-reading it per request would make every dictionary click
 * pay the parse cost again. A failed load is NOT memoised, so a transient read
 * error does not poison every later lookup.
 *
 * @returns the parsed dictionary, or null when it cannot be read.
 */
let loaded;
export async function loadDictionary() {
  if (loaded !== undefined) return loaded;
  try {
    const text = await readFile(DICT_PATH, 'utf8');
    const parsed = JSON.parse(text);
    loaded = {
      words: parsed.words ?? {},
      lemmas: parsed.lemmas ?? {},
    };
    return loaded;
  } catch (error) {
    console.error('[dsh-word-translate] dictionary unavailable:', error);
    return null;
  }
}

/** Normalise a lookup key the way dictionary entries are stored. */
function normaliseKey(text) {
  return text.trim().toLowerCase();
}

/**
 * Reduce a selection to the word to look up.
 *
 * A selection is often not a bare word: it can carry surrounding punctuation, be
 * an inflected form (`banks`, `running`, `better`), or be a short phrase. This
 * strips punctuation, tries the whole string, then the first word, and finally
 * the lemma map — so `banks` finds `bank` and `"mount,"` finds `mount`.
 *
 * A base entry is preferred over an inflected one even when BOTH are bundled,
 * because the base carries the study signals: `banks` has a bare gloss while
 * `bank` has the senses, the Collins rating and the exam tags. The matched form is
 * reported back so the reader can see why they got that entry.
 *
 * @param selection - the raw selected text.
 * @param dict - the loaded dictionary.
 * @returns the entry plus how it was found, or null when nothing matches.
 */
function resolveEntry(selection, dict) {
  const cleaned = normaliseKey(selection).replace(/^[^a-z]+|[^a-z'’-]+$/gu, '');
  if (cleaned.length === 0) return null;

  /** Resolve one token to a base entry when possible, else its own entry. */
  const resolveToken = (token) => {
    const base = dict.lemmas[token];
    if (base !== undefined && base !== token) {
      const baseEntry = dict.words[base];
      if (baseEntry !== undefined) return { word: base, entry: baseEntry, form: token };
    }
    const own = dict.words[token];
    return own === undefined ? null : { word: token, entry: own };
  };

  const whole = resolveToken(cleaned);
  if (whole !== null) {
    return whole.form === undefined
      ? { ...whole, via: 'exact' }
      : { ...whole, via: 'lemma' };
  }

  // A phrase or sentence: the first word is the best single-word answer.
  const first = cleaned.split(/[^a-z'’-]+/u).find((part) => part.length > 0);
  if (first !== undefined && first !== cleaned) {
    const found = resolveToken(first);
    if (found !== null) return { ...found, via: 'first-word' };
  }

  return null;
}

/**
 * Look one selection up in the bundled dictionary.
 *
 * @param selection - the raw selected text.
 * @returns a display-ready result, or null when the word is not in the dictionary.
 */
export async function lookupWord(selection) {
  const dict = await loadDictionary();
  if (dict === null) return null;
  const found = resolveEntry(selection, dict);
  if (found === null) return null;

  const { word, entry } = found;
  const tags = Array.isArray(entry.tg)
    ? entry.tg.map((tag) => TAG_LABELS[tag] ?? tag).filter((label) => label.length > 0)
    : [];

  return {
    word,
    /** How the selection resolved: `exact`, `lemma` (via an inflected form), or `first-word`. */
    via: found.via,
    /** The matched form when it differs from the headword, e.g. `banks` → `bank`. */
    matchedForm: found.form,
    phonetic: entry.ph ?? '',
    translation: entry.tr ?? '',
    partOfSpeech: entry.pos ?? '',
    collins: entry.co ?? 0,
    collinsLabel: COLLINS_LABELS[entry.co] ?? '',
    oxford: entry.ox === 1,
    tags,
    /** Lower is more frequent; 0 means ECDICT had no rank for this word. */
    bncRank: entry.bnc ?? 0,
    cocaRank: entry.frq ?? 0,
  };
}

/** Number of words in the bundled dictionary, or 0 when it cannot be read. */
export async function dictionarySize() {
  const dict = await loadDictionary();
  return dict === null ? 0 : Object.keys(dict.words).length;
}
