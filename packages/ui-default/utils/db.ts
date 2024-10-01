import { openDB as _open } from 'idb';
import { InfoDialog } from 'vj/components/dialog';
import { tpl } from 'vj/utils';

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
    new InfoDialog({
      $body: tpl.typoMsg('Some other opened tabs locked the database. Please close them.'),
    }).open();
  },
  blocking(currentVersion, blockedVersion) {
    console.error('IDB Blocking version', blockedVersion);
    new InfoDialog({
      $body: tpl.typoMsg('Please close or refresh this tab to perform the upgrade.'),
    }).open();
  },
  terminated() {
    console.error('IDB Terminated');
  },
});
