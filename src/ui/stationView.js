import { escapeHTML, escapeAttr } from '../logic/csv.js';
import {
  filterStationJobs,
  uniqueStationMaterials,
  subscribeStationJobs,
  stationHashBatchKey,
  updateStationJobCheck,
  mergeStationChecks,
} from '../logic/stationSync.js';

const ZOOM_STORAGE_KEY = 'opticut-station-zoom';
const ZOOM_STEPS = [0.7, 0.85, 1, 1.15, 1.3, 1.5];

function formatSentAt(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/** Compact "5m ago" style label for queue cards. */
function formatRelativeTime(ms, now = Date.now()) {
  if (!ms) return '';
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatSentAt(ms);
}

function formatClock(now = new Date()) {
  return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function setStationHash(batchKey) {
  const next = batchKey ? `#station/${encodeURIComponent(batchKey)}` : '#station';
  if (globalThis.location?.hash !== next) {
    globalThis.history?.replaceState(null, '', next);
  }
}

function sheetRenderKey(job) {
  if (!job?.batchKey) return '';
  return `${job.batchKey}|${job.sentAt || ''}|${String(job.html || '').length}`;
}

function loadZoom() {
  try {
    const saved = parseFloat(globalThis.localStorage?.getItem(ZOOM_STORAGE_KEY));
    if (ZOOM_STEPS.includes(saved)) return saved;
  } catch {
    /* private mode */
  }
  return 1;
}

function saveZoom(zoom) {
  try {
    globalThis.localStorage?.setItem(ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    /* private mode */
  }
}

const EMPTY_ICON = `
  <svg class="station-empty-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <rect x="7" y="10" width="34" height="28" rx="3" stroke="currentColor" stroke-width="2.5" opacity="0.45"/>
    <path d="M14 19h20M14 25h20M14 31h12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
  </svg>`;

/**
 * Mount the fullscreen station queue UI (search + material filter + multi-batch
 * + live synced checkboxes + zoom).
 * @param {HTMLElement} root
 * @returns {() => void} teardown
 */
export function mountStationView(root) {
  if (!root) return () => {};

  document.body.classList.add('station-live');
  root.hidden = false;
  root.innerHTML = `
    <header class="station-live-header">
      <div class="station-live-brand">
        <span class="station-brand-mark" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="8" fill="currentColor" opacity="0.18" />
            <path d="M8 10h12M8 14h12M8 18h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </span>
        <div class="station-brand-text">
          <strong>DBS Station</strong>
          <span class="station-live-status" id="station-live-status" data-state="connecting">
            <span class="station-status-dot" aria-hidden="true"></span>
            <span id="station-status-text">Connecting…</span>
          </span>
        </div>
      </div>
      <div class="station-live-clock" id="station-clock">${escapeHTML(formatClock())}</div>
    </header>
    <div class="station-live-layout">
      <aside class="station-queue" aria-label="Sent batches">
        <div class="station-queue-filters">
          <div class="station-search-wrap">
            <svg class="station-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.8"/>
              <path d="M13.5 13.5 17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <label class="sr-only" for="station-search">Search batch or order</label>
            <input
              id="station-search"
              class="input station-search"
              type="search"
              placeholder="Batch or order #…"
              autocomplete="off"
            />
            <button type="button" class="station-search-clear" id="station-search-clear" aria-label="Clear search" hidden>×</button>
          </div>
          <label class="sr-only" for="station-material">Material</label>
          <select id="station-material" class="input station-material">
            <option value="">All materials</option>
          </select>
        </div>
        <div class="station-queue-count" id="station-queue-count"></div>
        <div class="station-queue-list" id="station-queue-list" role="listbox"></div>
      </aside>
      <main class="station-live-main">
        <div class="station-batch-bar" id="station-batch-bar" hidden>
          <div class="station-batch-info">
            <h2 class="station-batch-title" id="station-batch-title"></h2>
            <div class="station-batch-chips" id="station-batch-chips"></div>
          </div>
          <div class="station-batch-tools">
            <div class="station-progress" id="station-progress" hidden>
              <div class="station-progress-track"><div class="station-progress-fill" id="station-progress-fill"></div></div>
              <span class="station-progress-label" id="station-progress-label"></span>
            </div>
            <div class="station-zoom" role="group" aria-label="Zoom cut list">
              <button type="button" class="station-zoom-btn" id="station-zoom-out" aria-label="Zoom out">−</button>
              <span class="station-zoom-label" id="station-zoom-label">100%</span>
              <button type="button" class="station-zoom-btn" id="station-zoom-in" aria-label="Zoom in">+</button>
            </div>
            <button
              type="button"
              class="station-print-btn"
              id="station-print-btn"
              title="Print or save as PDF"
            >
              Print / PDF
            </button>
          </div>
        </div>
        <div class="station-live-body" id="station-live-body">
          <div class="station-live-empty">
            ${EMPTY_ICON}
            <p class="station-empty-title">Waiting for batches</p>
            <p class="station-empty-hint">Send one from the prep computer with <b>Send to station</b>.</p>
          </div>
        </div>
      </main>
    </div>
  `;

  const statusEl = root.querySelector('#station-live-status');
  const statusTextEl = root.querySelector('#station-status-text');
  const clockEl = root.querySelector('#station-clock');
  const bodyEl = root.querySelector('#station-live-body');
  const listEl = root.querySelector('#station-queue-list');
  const countEl = root.querySelector('#station-queue-count');
  const searchEl = root.querySelector('#station-search');
  const searchClearEl = root.querySelector('#station-search-clear');
  const materialEl = root.querySelector('#station-material');
  const batchBarEl = root.querySelector('#station-batch-bar');
  const batchTitleEl = root.querySelector('#station-batch-title');
  const batchChipsEl = root.querySelector('#station-batch-chips');
  const progressEl = root.querySelector('#station-progress');
  const progressFillEl = root.querySelector('#station-progress-fill');
  const progressLabelEl = root.querySelector('#station-progress-label');
  const zoomOutEl = root.querySelector('#station-zoom-out');
  const zoomInEl = root.querySelector('#station-zoom-in');
  const zoomLabelEl = root.querySelector('#station-zoom-label');
  const printBtnEl = root.querySelector('#station-print-btn');

  /** @type {object[]} */
  let allJobs = [];
  let selectedKey = stationHashBatchKey();
  let renderedKey = '';
  let unsub = () => {};
  let cancelled = false;
  let zoom = loadZoom();
  /** @type {Map<string, Record<string, boolean>>} batchKey → rowId → wanted checked */
  const pendingByBatch = new Map();

  const clockTimer = setInterval(() => {
    clockEl.textContent = formatClock();
  }, 15000);

  function setStatus(state, text) {
    statusEl.dataset.state = state;
    statusTextEl.textContent = text;
  }

  function printSelectedBatch() {
    const job = allJobs.find((j) => j.batchKey === selectedKey);
    if (!job?.html || !bodyEl.querySelector('.cutlist-print-sheet')) {
      setStatus('error', 'Select a batch to print');
      return;
    }
    document.body.classList.add('station-print-active');
    const cleanup = () => {
      document.body.classList.remove('station-print-active');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    // Fallback if afterprint never fires (some browsers).
    setTimeout(cleanup, 2000);
    window.print();
  }

  function effectiveChecks(job) {
    if (!job) return {};
    return mergeStationChecks(job.checks, pendingByBatch.get(job.batchKey));
  }

  function setPending(batchKey, rowId, checked) {
    let map = pendingByBatch.get(batchKey);
    if (!map) {
      map = {};
      pendingByBatch.set(batchKey, map);
    }
    map[rowId] = checked;
  }

  function clearPendingRow(batchKey, rowId) {
    const map = pendingByBatch.get(batchKey);
    if (!map) return;
    delete map[rowId];
    if (!Object.keys(map).length) pendingByBatch.delete(batchKey);
  }

  /** Drop pending entries once the server matches what we wanted. */
  function clearPendingIfSynced(batchKey, serverChecks) {
    const pending = pendingByBatch.get(batchKey);
    if (!pending) return;
    const merged = mergeStationChecks(serverChecks, null);
    Object.keys(pending).forEach((rowId) => {
      const want = Boolean(pending[rowId]);
      const has = Boolean(merged[rowId]);
      if (want === has) delete pending[rowId];
    });
    if (!Object.keys(pending).length) pendingByBatch.delete(batchKey);
  }

  function countChecks(job) {
    const checks = effectiveChecks(job);
    const checked = Object.keys(checks).length;
    const total = job?.html ? (job.html.match(/class="station-check"/g) || []).length : 0;
    return { checked, total };
  }

  function applyStationChecks(rootEl, job) {
    const map = effectiveChecks(job);
    rootEl.querySelectorAll('.station-check[data-row-id]').forEach((input) => {
      const id = input.getAttribute('data-row-id') || '';
      const on = Boolean(map[id]);
      if (input.checked !== on) input.checked = on;
      input.closest('tr')?.classList.toggle('cutlist-row-done', on);
    });
  }

  function updateQueueItemProgress(batchKey, job) {
    const item = [...listEl.querySelectorAll('[data-batch-key]')].find(
      (el) => el.getAttribute('data-batch-key') === batchKey
    );
    if (!item || !job) return;
    const { checked: c, total } = countChecks(job);
    const pct = total ? Math.round((c / total) * 100) : 0;
    const done = total > 0 && c === total;
    item.classList.toggle('is-done', done);
    const bar = item.querySelector('.station-queue-progress');
    const fill = item.querySelector('.station-queue-progress i');
    if (bar && fill) {
      bar.classList.toggle('is-complete', done);
      fill.style.width = `${pct}%`;
    }
    const badge = item.querySelector('.station-queue-done-badge');
    if (done && !badge) {
      const top = item.querySelector('.station-queue-item-top');
      if (top) {
        top.insertAdjacentHTML('beforeend', '<span class="station-queue-done-badge">✓ Done</span>');
      }
    } else if (!done && badge) {
      badge.remove();
    }
  }

  function filters() {
    return {
      query: searchEl.value || '',
      material: materialEl.value || '',
    };
  }

  function applyZoom() {
    zoomLabelEl.textContent = `${Math.round(zoom * 100)}%`;
    zoomOutEl.disabled = ZOOM_STEPS.indexOf(zoom) <= 0;
    zoomInEl.disabled = ZOOM_STEPS.indexOf(zoom) >= ZOOM_STEPS.length - 1;
    const sheet = bodyEl.querySelector('.station-live-sheet');
    if (sheet) sheet.style.zoom = String(zoom);
  }

  function stepZoom(direction) {
    const idx = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[idx + direction];
    if (!next) return;
    zoom = next;
    saveZoom(zoom);
    applyZoom();
  }

  function renderMaterialOptions(jobs) {
    const current = materialEl.value;
    const materials = uniqueStationMaterials(jobs);
    materialEl.innerHTML =
      `<option value="">All materials</option>` +
      materials
        .map(
          (name) =>
            `<option value="${escapeAttr(name)}"${name === current ? ' selected' : ''}>${escapeHTML(name)}</option>`
        )
        .join('');
    if (current && !materials.includes(current)) {
      materialEl.value = '';
    }
  }

  function renderBatchBar(job) {
    if (!job?.html) {
      batchBarEl.hidden = true;
      printBtnEl.disabled = true;
      return;
    }
    batchBarEl.hidden = false;
    printBtnEl.disabled = false;
    batchTitleEl.textContent = job.batchKey || '';

    const orderCount = Array.isArray(job.orders) ? job.orders.length : 0;
    const chips = [
      job.isSpecial ? { text: '★ Special', cls: ' station-chip--special' } : null,
      job.materialName ? { text: job.materialName, cls: '' } : null,
      job.totalBoxes ? { text: `${job.totalBoxes} boxes`, cls: '' } : null,
      orderCount ? { text: `${orderCount} order${orderCount === 1 ? '' : 's'}`, cls: '' } : null,
      job.sentAt ? { text: `Sent ${formatSentAt(job.sentAt)}`, cls: ' station-chip--muted' } : null,
    ].filter(Boolean);
    batchChipsEl.innerHTML = chips
      .map((c) => `<span class="station-chip${c.cls}">${escapeHTML(c.text)}</span>`)
      .join('');

    const { checked, total } = countChecks(job);
    if (total > 0) {
      progressEl.hidden = false;
      const pct = Math.round((checked / total) * 100);
      progressFillEl.style.width = `${pct}%`;
      progressEl.classList.toggle('is-complete', checked === total);
      progressLabelEl.textContent = checked === total ? `All ${total} done` : `${checked} / ${total}`;
    } else {
      progressEl.hidden = true;
    }
  }

  function renderSelected(job) {
    renderBatchBar(job);
    if (!job?.html) {
      renderedKey = '';
      bodyEl.innerHTML = `
        <div class="station-live-empty">
          ${EMPTY_ICON}
          <p class="station-empty-title">No batch selected</p>
          <p class="station-empty-hint">Pick a batch from the list, or send one with <b>Send to station</b>.</p>
        </div>`;
      return;
    }

    const nextKey = sheetRenderKey(job);
    if (nextKey === renderedKey && bodyEl.querySelector('.station-check')) {
      applyStationChecks(bodyEl, job);
      return;
    }

    renderedKey = nextKey;
    bodyEl.innerHTML = `<div class="station-live-sheet cutlist-screen-preview">${job.html}</div>`;
    applyStationChecks(bodyEl, job);
    applyZoom();
  }

  function renderQueue() {
    const filtered = filterStationJobs(allJobs, filters());
    countEl.textContent = filtered.length
      ? `${filtered.length} of ${allJobs.length} batch${allJobs.length === 1 ? '' : 'es'}`
      : allJobs.length
        ? 'No batches match'
        : 'No batches sent yet';

    if (!selectedKey && filtered.length) {
      selectedKey = filtered[0].batchKey;
      setStationHash(selectedKey);
    } else if (selectedKey && !allJobs.some((j) => j.batchKey === selectedKey)) {
      selectedKey = filtered[0]?.batchKey || '';
      setStationHash(selectedKey);
    }

    listEl.innerHTML = filtered.length
      ? filtered
          .map((job) => {
            const isActive = job.batchKey === selectedKey;
            const { checked, total } = countChecks(job);
            const pct = total ? Math.round((checked / total) * 100) : 0;
            const done = total > 0 && checked === total;
            const orders =
              Array.isArray(job.orders) && job.orders.length
                ? escapeHTML(job.orders.slice(0, 4).join(', ')) +
                  (job.orders.length > 4 ? ` +${job.orders.length - 4}` : '')
                : '';
            return `
              <button
                type="button"
                class="station-queue-item${isActive ? ' is-active' : ''}${done ? ' is-done' : ''}"
                role="option"
                aria-selected="${isActive ? 'true' : 'false'}"
                data-batch-key="${escapeAttr(job.batchKey)}"
              >
                <span class="station-queue-item-top">
                  <span class="station-queue-item-title">${escapeHTML(job.batchKey)}${job.isSpecial ? ' <span class="station-queue-star">★</span>' : ''}</span>
                  ${done ? '<span class="station-queue-done-badge">✓ Done</span>' : ''}
                </span>
                <span class="station-queue-item-meta">${escapeHTML(job.materialName || '—')} · ${job.totalBoxes || 0} bx</span>
                ${orders ? `<span class="station-queue-item-orders">${orders}</span>` : ''}
                <span class="station-queue-item-bottom">
                  <span class="station-queue-progress${done ? ' is-complete' : ''}"><i style="width:${pct}%"></i></span>
                  <span class="station-queue-item-time">${escapeHTML(formatRelativeTime(job.sentAt))}</span>
                </span>
              </button>`;
          })
          .join('')
      : `<div class="station-queue-empty">No matching batches</div>`;

    const selected = allJobs.find((j) => j.batchKey === selectedKey) || null;
    renderSelected(selected);
  }

  function onJobs(jobs) {
    if (cancelled) return;
    jobs.forEach((j) => clearPendingIfSynced(j.batchKey, j.checks));
    allJobs = jobs;
    setStatus(
      'live',
      jobs.length ? `Live · ${jobs.length} batch${jobs.length === 1 ? '' : 'es'}` : 'Live · waiting'
    );
    renderMaterialOptions(jobs);
    renderQueue();
  }

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-batch-key]');
    if (!btn) return;
    selectedKey = btn.getAttribute('data-batch-key') || '';
    setStationHash(selectedKey);
    renderedKey = '';
    renderQueue();
  });

  bodyEl.addEventListener('change', (e) => {
    const input = e.target.closest('.station-check');
    if (!input || !(input instanceof HTMLInputElement)) return;
    const rowId = input.getAttribute('data-row-id') || '';
    const batchKey = selectedKey;
    if (!rowId || !batchKey) return;

    const checked = input.checked;
    input.closest('tr')?.classList.toggle('cutlist-row-done', checked);
    setPending(batchKey, rowId, checked);

    const job = allJobs.find((j) => j.batchKey === batchKey);
    if (job) {
      renderBatchBar(job);
      updateQueueItemProgress(batchKey, job);
    }

    void updateStationJobCheck(batchKey, rowId, checked)
      .then(() => {
        // Keep pending until a snapshot confirms; avoids flicker if another
        // snapshot arrives mid-flight.
      })
      .catch((err) => {
        console.error(err);
        clearPendingRow(batchKey, rowId);
        input.checked = !checked;
        input.closest('tr')?.classList.toggle('cutlist-row-done', !checked);
        if (job) {
          renderBatchBar(job);
          updateQueueItemProgress(batchKey, job);
        }
        setStatus('error', 'Check save failed — try again');
      });
  });

  // Larger tap target: clicking the check cell (not the input) toggles the box.
  bodyEl.addEventListener('click', (e) => {
    if (e.target.closest('.station-check')) return;
    const cell = e.target.closest('td.cutlist-check');
    if (!cell) return;
    const input = cell.querySelector('.station-check');
    if (!input) return;
    e.preventDefault();
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  searchEl.addEventListener('input', () => {
    searchClearEl.hidden = !searchEl.value;
    renderQueue();
  });
  searchClearEl.addEventListener('click', () => {
    searchEl.value = '';
    searchClearEl.hidden = true;
    renderQueue();
    searchEl.focus();
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchEl.value = '';
      searchClearEl.hidden = true;
      renderQueue();
    }
  });
  materialEl.addEventListener('change', () => renderQueue());
  zoomOutEl.addEventListener('click', () => stepZoom(-1));
  zoomInEl.addEventListener('click', () => stepZoom(1));
  printBtnEl.addEventListener('click', () => printSelectedBatch());

  void subscribeStationJobs(onJobs, (err) => {
    if (cancelled) return;
    setStatus('error', 'Connection error');
    batchBarEl.hidden = true;
    bodyEl.innerHTML = `
      <div class="station-live-empty station-live-empty--error">
        ${EMPTY_ICON}
        <p class="station-empty-title">Could not connect</p>
        <p class="station-empty-hint">${escapeHTML(err?.message || 'Unknown error')}</p>
      </div>`;
  }).then((stop) => {
    if (cancelled) {
      stop();
      return;
    }
    unsub = stop;
  });

  return () => {
    cancelled = true;
    clearInterval(clockTimer);
    unsub();
    document.body.classList.remove('station-live');
    root.hidden = true;
    root.innerHTML = '';
  };
}
