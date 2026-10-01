/**
 * Durable translation history for `dsh-word-translate`.
 *
 * This is the plugin's memory. Every successful AI translation is recorded here,
 * and the record serves two purposes at once:
 *
 * 1. **A study log.** The user can browse and delete entries, and the entries they
 *    keep are the ones worth re-reading. A word looked up five times is a word
 *    they keep meeting — a more honest frequency signal than a manual "favourite",
 *    which is why this plugin keeps a history rather than a word list.
 * 2. **A persistent cache.** A repeat lookup of the same text in the same context
 *    is served from here instead of costing another model call, and unlike the
 *    in-memory cache it survives a restart.
 *
 * Storage is the Host's own `ctx.storage` KV stack (the `dsh-storage-json`
 * backend, writing under `$DSH_HOME/storages`), which gives atomic whole-file
 * replacement and a version-stamped format. That is deliberately preferred over
 * browser `localStorage`: the data outlives the browser profile, is a readable
 * JSON file the user can back up, and is validated on open.
 *
 * The KV API is reached through `ctx.storage` when present. A deployment without
 * it degrades to an in-memory map, so the plugin still works — it just forgets
 * across restarts instead of failing.
 *
 * @module dsh-word-translate/history
 */

/** Storage unit name; the backend writes `$DSH_HOME/storages/<name>.json`. */
const UNIT_NAME = 'word_translate';

/** Unit format version. Bumping it discards incompatible stored data. */
const UNIT_VERSION = 1;

/** Table holding translation records, keyed by record id. */
const TABLE = 'translations';

/**
 * Bound on retained records.
 *
 * The history is a reading aid, not an archive: beyond a few thousand entries the
 * oldest are stale by any reasonable measure, and the whole unit is rewritten on
 * each write, so an unbounded table would make every new translation slower.
 */
const MAX_RECORDS = 2_000;

/**
 * Build the identity of a translation.
 *
 * The key is the text AND its context, because the whole point of this plugin is
 * that the same word means different things in different sentences: `bank` in
 * `river bank` is not `bank` in `account balance at the bank`. Keying on the text
 * alone would serve the wrong sense from cache.
 *
 * @param request - the selection and its surrounding context.
 * @returns a stable record id.
 */
export function recordIdOf(request) {
  const material = `${request.selected}\u0000${request.before}\u0000${request.after}`;
  // A short, stable, filesystem-safe id. Not cryptographic: this is a cache key
  // and a record name, so collision resistance only has to beat accidental reuse.
  let hash = 0x811c9dc5;
  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `t${hash.toString(16).padStart(8, '0')}`;
}

/**
 * An in-memory stand-in with the same shape as the durable store.
 *
 * Used when no storage backend is mounted. Keeping one implementation of the
 * record rules and swapping only the persistence means the two paths cannot drift.
 *
 * @returns a store backed by a Map.
 */
function memoryStore() {
  const records = new Map();
  return {
    durable: false,
    async all() {
      return [...records.values()];
    },
    async put(record) {
      records.set(record.id, record);
    },
    async remove(id) {
      return records.delete(id);
    },
  };
}

/**
 * Open the durable store over `ctx.storage`.
 *
 * The KV facet's contract is `loadAll()` for a full read and `putRecord` /
 * `deleteRecord` for writes, all keyed by `(table, key)`. Reads come from the
 * backend's validated in-memory state, so `all()` is cheap enough to call per
 * request — which is what lets the history route stay stateless.
 *
 * The backend allows exactly ONE live handle per unit name and rejects a second
 * `open` with "already open". That makes the returned `close` mandatory: without
 * it, the first activation holds the unit for the process lifetime and every
 * later activation — including one created by a hot reload — fails to open and
 * silently falls back to memory, so translations stop being persisted. The caller
 * must therefore register `close` as a disposer.
 *
 * @param ctx - plugin context, probed for `storage`.
 * @returns `{ store, close }`, or null when no usable backend is mounted.
 */
async function openDurableStore(ctx) {
  const storage = ctx.get?.('storage');
  const kv = storage?.backend?.get?.('json')?.kv;
  if (kv === undefined || kv === null) return null;
  let unit;
  try {
    unit = await kv.open({
      name: UNIT_NAME,
      version: UNIT_VERSION,
      tables: [TABLE],
      hasGlobal: false,
      layout: 'single',
    });
  } catch (error) {
    console.error('[dsh-word-translate] durable history unavailable:', error);
    return null;
  }
  return {
    close: async () => {
      try {
        await unit.close();
      } catch (error) {
        console.error('[dsh-word-translate] could not close the history unit:', error);
      }
    },
    store: {
      durable: true,
      async all() {
        const state = await unit.loadAll();
        return Object.values(state.tables?.[TABLE] ?? {});
      },
      async put(record) {
        await unit.putRecord(TABLE, record.id, record);
      },
      async remove(id) {
        await unit.deleteRecord(TABLE, id);
        return true;
      },
    },
  };
}

/**
 * Open the translation history.
 *
 * @param ctx - plugin context.
 * @returns a history handle with `all`, `find`, `remember`, `forget`, `forgetAll`.
 */
export async function openHistory(ctx) {
  const durable = await openDurableStore(ctx);
  const store = durable?.store ?? memoryStore();

  /**
  * Release the unit when this activation goes away.
  *
  * This is what lets a hot reload or a disable/enable cycle reopen the history
  * instead of falling back to memory for the rest of the process's life.
  */
  if (durable !== null) {
    try {
      ctx.effect(() => durable.close, 'dsh-word-translate: history unit');
    } catch (error) {
      console.error('[dsh-word-translate] could not register the history disposer:', error);
    }
  }

  /**
   * Drop the oldest records once the table exceeds its bound.
   *
   * Ordering is by `at` (the time the translation was made), so the bound evicts
   * what the user is least likely to want back.
   */
  async function trim() {
    const records = await store.all();
    if (records.length <= MAX_RECORDS) return;
    const excess = records
      .slice()
      .sort((left, right) => (left.at ?? 0) - (right.at ?? 0))
      .slice(0, records.length - MAX_RECORDS);
    for (const record of excess) await store.remove(record.id);
  }

  return {
    /** Whether records survive a restart. */
    durable: store.durable,

    /**
    * Every record, newest first.
    * @returns the retained records.
    */
    async all() {
      const records = await store.all();
      return records.sort((left, right) => (right.at ?? 0) - (left.at ?? 0));
    },

    /**
    * Look one translation up by its identity.
    * @param request - selection and context.
    * @returns the record, or null when absent.
    */
    async find(request) {
      const id = recordIdOf(request);
      const records = await store.all();
      return records.find((record) => record.id === id) ?? null;
    },

    /**
    * Record a successful translation, replacing any earlier record for the same
    * identity so a repeat lookup refreshes the timestamp rather than duplicating.
    * @param entry - the record to store.
    * @returns the stored record.
    */
    async remember(entry) {
      const record = {
        id: recordIdOf(entry),
        selected: entry.selected,
        before: entry.before ?? '',
        after: entry.after ?? '',
        translation: entry.translation,
        ...(entry.usage === undefined ? {} : { usage: entry.usage }),
        ...(entry.model === undefined ? {} : { model: entry.model }),
        at: entry.at ?? Date.now(),
      };
      await store.put(record);
      await trim();
      return record;
    },

    /**
    * Delete one record.
    * @param id - the record id.
    * @returns true when a record was removed.
    */
    async forget(id) {
      return store.remove(id);
    },

    /**
    * Delete every record.
    * @returns the number removed.
    */
    async forgetAll() {
      const records = await store.all();
      for (const record of records) await store.remove(record.id);
      return records.length;
    },
  };
}
