// All index parsing and lookups run off the UI thread.
let worker;
let serial = 0;
const pending = new Map();
export function queryBrochureKnowledge(action, payload = {}) {
  try {
    if (!worker) {
      worker = new Worker(new URL('./knowledgeWorker.js?v=20261023.search2', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        const request = pending.get(data.id);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(data.id);
        data.error ? request.reject(Error(data.error)) : request.resolve(data.result);
      };
      worker.onerror = () => {
        for (const request of pending.values()) {
          clearTimeout(request.timer);
          request.reject(Error('Index unavailable'));
        }
        pending.clear();
        worker?.terminate();
        worker = null;
      };
    }
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(Error('Index timed out')); }, 30000);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, action, ...payload });
    });
  } catch (error) { return Promise.reject(error); }
}
