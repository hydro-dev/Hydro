import { openDB as _open } from 'idb';
import { alert } from 'vj/components/dialog';

export const openDB = _open('hydro', 1, {
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
});
