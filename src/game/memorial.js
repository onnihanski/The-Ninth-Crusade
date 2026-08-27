// ---------------------------------------------------------------------------
// THE DUNGEON REMEMBERS
//
// Every crusader who dies is written down. On later runs they are still where
// they fell -- as a revenant wearing their own name, holding whatever they were
// carrying when they died. Kill them and you get your old relics back.
//
// Storage is injected rather than reached for, so the browser uses
// localStorage and the headless tests use a plain object.
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'ninth-crusade.memorial.v1';
const MAX_ENTRIES = 60;
const MAX_REVENANTS_PER_DEPTH = 3;

// Nobody returns to the first two floors. Dying on depth 1 used to seed depth 1
// with your own revenant, so each death made the opening harder than the last
// and a new player could be locked out of their own game in three runs. The
// crusaders who died in the mud outside the walls simply do not come back.
const MIN_REVENANT_DEPTH = 3;

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

/** localStorage if it is usable, an in-memory stand-in if it is not. */
export function browserStorage() {
  try {
    const probe = '__probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    return memoryStorage();
  }
}

export class Memorial {
  constructor(storage = memoryStorage()) {
    this.storage = storage;
    this.entries = this.load();
  }

  load() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  save() {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // A full or disabled store costs us persistence, never the run in progress.
    }
  }

  /** How many crusades have been sent down, counting the one starting now. */
  runNumber() {
    return this.entries.length + 1;
  }

  record(entry) {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.save();
  }

  /**
   * Who to meet again at this depth. Most recent first and capped, so depth 1
   * does not eventually become a wall of your own corpses.
   */
  atDepth(depth) {
    if (depth < MIN_REVENANT_DEPTH) return [];
    return this.entries
      .filter((e) => e.depth === depth)
      .slice(-MAX_REVENANTS_PER_DEPTH);
  }

  clear() {
    this.entries = [];
    this.storage.removeItem(STORAGE_KEY);
  }
}
