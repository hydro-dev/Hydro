import queueMicrotask from 'queue-microtask';
import browserUpdate from 'browser-update';

window.queueMicrotask = queueMicrotask;
browserUpdate({
  required: {
    e: -10, f: -10, o: -3, s: -1, c: -10,
  },
  insecure: true,
  api: 2022.03,
});
