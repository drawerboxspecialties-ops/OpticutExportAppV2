import { escapeHTML, escapeAttr } from '../logic/csv.js';
import {
  filterStationJobs,
  uniqueStationMaterials,
  subscribeStationJobs,
  stationHashBatchKey,
  updateStationJobCheck,
} from '../logic/stationSync.js';

function formatSentAt(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
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

function countChecks(job) {
  const checks = job?.checks && typeof job.checks === 'object' ? job.checks : {};
  const checked = Object.keys(checks).filter((k) => checks[k]).length;
  const total = job?.html ? (job.html.match(/class="station-check"/g) || []).length : 0;
  return { checked, total };
}

function applyStationChecks(root, checks) {
  const map = checks && typeof checks === 'object' ? checks : {};
  root.querySelectorAll('.station-check[data-row-id]').forEach((input) => {
    const id = input.getAttribute('data-row-id') || '';
    const on = Boolean(map[id]);
    if (input.checked !== on) input.checked = on;
    input.closest('tr')?.classList.toggle('cutlist-row-done', on);
  });
}

/**
 * Mount the fullscreen station queue UI (search + material filter + multi-batch).
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
        <strong>DBS Station</strong>
        <span class="station-live-status" id="station-live-status">Connecting…</span>
      </div>
      <div class="station-live-meta" id="station-live-meta"></div>
    </header>
    <div class="station-live-layout">
      <aside class="station-queue" aria-label="Sent batches">
        <div class="station-queue-filters">
          <label class="sr-only" for="station-search">Search batch or order</label>
          <input
            id="station-search"
            class="input station-search"
            type="search"
            placeholder="Search batch or order #"
            autocomplete="off"
          />
          <label class="sr-only" for="station-material">Material</label>
          <select id="station-material" class="input station-material">
            <option value="">All materials</option>
          </select>
        </div>
        <div class="station-queue-count" id="station-queue-count"></div>
        <div class="station-queue-list" id="station-queue-list" role="listbox"></div>
      </aside>
      <main class="station-live-body" id="station-live-body">
        <div class="station-live-empty">
          Waiting for batches… Send from the prep computer with <b>Send to station</b>.
        </div>
      </main>
    </div>
  `;

  const statusEl = root.querySelector('#station-live-status');
  const metaEl = root.querySelector('#station-live-meta');
  const bodyEl = root.querySelector('#station-live-body');
  const listEl = root.querySelector('#station-queue-list');
  const countEl = root.querySelector('#station-queue-count');
  const searchEl = root.querySelector('#station-search');
  const materialEl = root.querySelector('#station-material');

  /** @type {object[]} */
  let allJobs = [];
  let selectedKey = stationHashBatchKey();
  let renderedKey = '';
  let unsub = () => {};
  let cancelled = false;
  let savingCheck = false;

  function filters() {
    return {
      query: searchEl.value || '',
      material: materialEl.value || '',
    };
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

  function updateMeta(job) {
    if (!job?.html) {
      metaEl.textContent = '';
      return;
    }
    const boxes = job.totalBoxes ? `${job.totalBoxes} boxes` : '';
    const sent = formatSentAt(job.sentAt);
    const orders = Array.isArray(job.orders) && job.orders.length ? job.orders.join(', ') : '';
    const { checked, total } = countChecks(job);
    const progress = total ? `${checked}/${total} checked` : '';
    metaEl.innerHTML = [
      job.batchKey ? `<span>${escapeHTML(job.batchKey)}</span>` : '',
      job.materialName ? `<span>${escapeHTML(job.materialName)}</span>` : '',
      boxes ? `<span>${escapeHTML(boxes)}</span>` : '',
      progress ? `<span class="station-live-progress">${escapeHTML(progress)}</span>` : '',
      orders ? `<span>${escapeHTML(orders)}</span>` : '',
      sent ? `<span>Sent ${escapeHTML(sent)}</span>` : '',
    ]
      .filter(Boolean)
      .join('');
  }

  function renderSelected(job) {
    if (!job?.html) {
      renderedKey = '';
      metaEl.textContent = '';
      bodyEl.innerHTML = `
        <div class="station-live-empty">
          Select a batch from the list, or send one with <b>Send to station</b>.
        </div>`;
      return;
    }

    updateMeta(job);
    const nextKey = sheetRenderKey(job);
    if (nextKey === renderedKey && bodyEl.querySelector('.station-check')) {
      applyStationChecks(bodyEl, job.checks);
      return;
    }

    renderedKey = nextKey;
    bodyEl.innerHTML = `<div class="station-live-sheet cutlist-screen-preview">${job.html}</div>`;
    applyStationChecks(bodyEl, job.checks);
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
            const active = job.batchKey === selectedKey ? ' is-active' : '';
            const special = job.isSpecial ? ' ★' : '';
            const { checked, total } = countChecks(job);
            const progress = total ? ` · ${checked}/${total}` : '';
            const orders =
              Array.isArray(job.orders) && job.orders.length
                ? escapeHTML(job.orders.slice(0, 6).join(', ')) +
                  (job.orders.length > 6 ? ` +${job.orders.length - 6}` : '')
                : '';
            return `
              <button
                type="button"
                class="station-queue-item${active}"
                role="option"
                aria-selected="${job.batchKey === selectedKey ? 'true' : 'false'}"
                data-batch-key="${escapeAttr(job.batchKey)}"
              >
                <span class="station-queue-item-title">${escapeHTML(job.batchKey)}${special}</span>
                <span class="station-queue-item-meta">${escapeHTML(job.materialName || '—')} · ${job.totalBoxes || 0} bx${escapeHTML(progress)}</span>
                ${orders ? `<span class="station-queue-item-orders">${orders}</span>` : ''}
                <span class="station-queue-item-time">${escapeHTML(formatSentAt(job.sentAt))}</span>
              </button>`;
          })
          .join('')
      : `<div class="station-queue-empty">No matching batches</div>`;

    const selected = allJobs.find((j) => j.batchKey === selectedKey) || null;
    renderSelected(selected);
  }

  function onJobs(jobs) {
    if (cancelled) return;
    allJobs = jobs;
    statusEl.textContent = jobs.length ? `${jobs.length} live` : 'Waiting…';
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
    if (!rowId || !batchKey || savingCheck) return;

    const checked = input.checked;
    input.closest('tr')?.classList.toggle('cutlist-row-done', checked);

    // Optimistic local job update so progress counts refresh immediately.
    const job = allJobs.find((j) => j.batchKey === batchKey);
    if (job) {
      job.checks = { ...(job.checks || {}) };
      if (checked) job.checks[rowId] = true;
      else delete job.checks[rowId];
      updateMeta(job);
      const itemMeta = listEl.querySelector(`[data-batch-key="${batchKey.replace(/"/g, '')}"] .station-queue-item-meta`);
      if (itemMeta) {
        const { checked: c, total } = countChecks(job);
        const base = `${job.materialName || '—'} · ${job.totalBoxes || 0} bx`;
        itemMeta.textContent = total ? `${base} · ${c}/${total}` : base;
      }
    }

    savingCheck = true;
    void updateStationJobCheck(batchKey, rowId, checked)
      .catch((err) => {
        console.error(err);
        input.checked = !checked;
        input.closest('tr')?.classList.toggle('cutlist-row-done', !checked);
        statusEl.textContent = 'Check save failed';
      })
      .finally(() => {
        savingCheck = false;
      });
  });

  searchEl.addEventListener('input', () => renderQueue());
  materialEl.addEventListener('change', () => renderQueue());

  void subscribeStationJobs(onJobs, (err) => {
    if (cancelled) return;
    statusEl.textContent = 'Connection error';
    metaEl.textContent = '';
    bodyEl.innerHTML = `
      <div class="station-live-empty station-live-empty--error">
        Could not connect to Firebase.<br>
        ${escapeHTML(err?.message || 'Unknown error')}
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
    unsub();
    document.body.classList.remove('station-live');
    root.hidden = true;
    root.innerHTML = '';
  };
}
