import { openDB as _open } from 'idb';
import { alert } from 'vj/components/dialog';

const scratchpadCleanup: string[] = [];

export const openDB = _open('hydro', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      const solutionStore = db.createObjectStore('solutions', { keyPath: 'id' });
      db.createObjectStore('scoreboard-star', { keyPath: 'id' });
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.endsWith('#objective')) {
          const value = localStorage.getItem(key);
          if (value) solutionStore.put({ id: key, value });
          localStorage.removeItem(key);
        }
        if (key.startsWith('scoreboard-star/')) localStorage.removeItem(key);
        if (/^0\.\d+$/.test(key)) localStorage.removeItem(key);
      }
    }
    if (oldVersion < 2) db.createObjectStore('domain-info', { keyPath: 'id' });
    if (oldVersion < 3) {
      const scratchpadStore = db.createObjectStore('scratchpad-drafts', { keyPath: 'id' });
      const drafts = new Map<string, { id: string, code?: string, lang?: string }>();
      const scratchpadKey = /^(\d+\/[A-Za-z]\w{3,31}\/\d+(?:@[\dA-Fa-f]{24})?)(#lang)?$/;
      for (const key of Object.keys(localStorage)) {
        const match = key.match(scratchpadKey);
        if (!match) continue;
        const value = localStorage.getItem(key);
        if (value === null) continue;
        const draft = drafts.get(match[1]) || { id: match[1] };
        if (match[2]) draft.lang = value;
        else draft.code = value;
        drafts.set(draft.id, draft);
        scratchpadCleanup.push(key);
      }
      for (const draft of drafts.values()) scratchpadStore.put(draft);
    }
  },
  blocked(currentVersion, blockedVersion) {
    console.error('IDB Blocked by version', blockedVersion, 'want', currentVersion);
    alert('Some other opened tabs locked the database. Please close them.');
  },
  blocking(currentVersion, blockedVersion) {
    console.error('IDB Blocking version', blockedVersion);
    alert('Please close or refresh this tab to perform the upgrade.');
  },
  terminated() {
    console.error('IDB Terminated');
  },
}).then((db) => {
  for (const key of scratchpadCleanup) localStorage.removeItem(key);
  return db;
});
