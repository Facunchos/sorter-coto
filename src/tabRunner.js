// tabRunner.js — centralized helpers to open/search tabs in a paced/queued manner
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.tabRunner = (function () {
  "use strict";

  const DEFAULT_DELAY_MS = 750;

  const BATCH_QUEUE_KEY = "cotoSorterBatchQueueV1";
  const BATCH_LOCK_KEY = "cotoSorterBatchLockV1";
  const BATCH_ITEMS_KEY = "cotoSorterBatchItemsV1";

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

  function readBatchItems() {
    const items = readJsonStorage(BATCH_ITEMS_KEY, []);
    return Array.isArray(items) ? items.filter(Boolean) : [];
  }

  function writeBatchItems(items) {
    writeJsonStorage(BATCH_ITEMS_KEY, Array.isArray(items) ? items : []);
  }

  function getBatchItemById(itemId) {
    if (!itemId) return null;
    return readBatchItems().find((item) => item && item.id === itemId) || null;
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
    const nextId = readBatchQueue()[0];
    if (!nextId) {
      writeBatchItems([]);
      return null;
    }

    return getBatchItemById(nextId);
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

    const normalizedItems = items
      .map((item) => ({
        id: String(item?.id || "").trim(),
        url: String(item?.url || "").trim().split('#')[0],
      }))
      .filter((item) => item.id && item.url);

    if (normalizedItems.length === 0) return;

    const debugLog = window.CotoSorter?.logger?.debugLog || (() => {});
    debugLog("tabRunner: opening batch tabs", {
      count: normalizedItems.length,
      firstId: normalizedItems[0]?.id || null,
      firstUrl: normalizedItems[0]?.url || null,
      delay,
    });

    // Ensure saved batch items use clean URLs (no fragments)
    writeBatchQueue(normalizedItems.map((item) => item.id));
    writeBatchItems(normalizedItems.map((it) => ({ id: it.id, url: String(it.url).split('#')[0] })));
    clearBatchLock();

    const first = normalizedItems[0];
    try {
      const opened = window.open(String(first.url).split('#')[0], "_blank", "noopener,noreferrer");
      if (opened && typeof opened.blur === "function") {
        try { opened.blur(); } catch { /* ignore */ }
      }
    } catch (err) {
      console.debug("tabRunner: open failed", err?.message || err);
      debugLog("tabRunner: window.open failed", {
        message: err?.message || String(err),
        firstUrl: first.url,
      });
    }

    if (delay > 0) {
      await wait(delay);
    }
  }

  return {
    openBatchTabs,
    waitForBatchTurn,
    releaseBatchTurn,
    getBatchItemById,
  };
})();
