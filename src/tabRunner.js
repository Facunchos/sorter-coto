// tabRunner.js — centralized helpers to open/search tabs in a paced/queued manner
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.tabRunner = (function () {
  "use strict";

  const DEFAULT_DELAY_MS = 750;

  const BATCH_QUEUE_KEY = "cotoSorterBatchQueueV1";
  const BATCH_LOCK_KEY = "cotoSorterBatchLockV1";

  function readJsonStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  function readBatchQueue() {
    const q = readJsonStorage(BATCH_QUEUE_KEY, []);
    return Array.isArray(q) ? q.filter(Boolean) : [];
  }

  function writeBatchQueue(queue) {
    writeJsonStorage(BATCH_QUEUE_KEY, Array.isArray(queue) ? queue : []);
  }

  function getBatchLock() {
    return String(localStorage.getItem(BATCH_LOCK_KEY) || "");
  }

  function setBatchLock(itemId) {
    try {
      localStorage.setItem(BATCH_LOCK_KEY, String(itemId || ""));
    } catch {
      /* ignore */
    }
  }

  function clearBatchLock(itemId) {
    try {
      const current = getBatchLock();
      if (!current || !itemId || current === itemId) {
        localStorage.removeItem(BATCH_LOCK_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  function enqueueBatchItem(itemId) {
    const queue = readBatchQueue();
    if (!queue.includes(itemId)) {
      queue.push(itemId);
      writeBatchQueue(queue);
    }
  }

  function dequeueBatchItem(itemId) {
    const next = readBatchQueue().filter((id) => id !== itemId);
    writeBatchQueue(next);
  }

  async function waitForBatchTurn(itemId, timeoutMs = 180000) {
    enqueueBatchItem(itemId);
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const queue = readBatchQueue();
      const lock = getBatchLock();

      if (queue[0] === itemId && (!lock || lock === itemId)) {
        setBatchLock(itemId);
        return true;
      }

      if (!queue.includes(itemId)) enqueueBatchItem(itemId);
      await wait(500);
    }

    dequeueBatchItem(itemId);
    return false;
  }

  function releaseBatchTurn(itemId) {
    dequeueBatchItem(itemId);
    clearBatchLock(itemId);
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Open many search tabs in a paced sequence to avoid overloading the target
  // site and to reduce concurrent Vista Ligera runs in newly opened tabs.
  // items: array of { id, url }
  async function openBatchTabs(items, opts = {}) {
    const delay = Number.isFinite(Number(opts.delayMs)) ? Number(opts.delayMs) : DEFAULT_DELAY_MS;
    if (!Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
      try {
        if (!item || !item.url) continue;
        const opened = window.open(item.url, "_blank", "noopener,noreferrer");
        // Best-effort: avoid requesting focus back; some browsers still focus the new tab.
        if (opened && typeof opened.blur === "function") {
          try { opened.blur(); } catch { /* ignore */ }
        }
      } catch (err) {
        // ignore per-item errors
        console.debug("tabRunner: open failed", err?.message || err);
      }
      await wait(delay);
    }
  }

  return {
    openBatchTabs,
    waitForBatchTurn,
    releaseBatchTurn,
  };
})();
