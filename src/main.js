import './styles.css';
import { parseCSV, convertToCSV, escapeHTML, escapeAttr } from './logic/csv.js';
import { mapHeaders } from './logic/headers.js';
import { cleanMaterialName } from './logic/materialNames.js';
import { normalizeTopEdgeName } from './logic/topEdges.js';
import {
  splitDataIntoGroups,
  defaultFrontTopEdgesFromBacks,
  normalizeTopEdges,
  applyExclusions,
} from './logic/grouping.js';
import { getCutListRowsForExport } from './logic/exportRows.js';
import { formatDecimalForDisplay } from './logic/widths.js';
import { loadSettings, saveSettings, rememberFile } from './logic/settingsStore.js';
import { DEMO_CSV } from './logic/demoData.js';
import {
  resetCheckboxCounter,
  renderStackMatrixRows,
  buildCompactPrintCard,
} from './ui/stackMatrixView.js';

const $ = (id) => document.getElementById(id);

const state = {
  parsedHeaders: [],
  parsedRows: [],
  originalParsedRows: [],
  splitGroups: {},
  activeGroupKey: '',
  validationErrors: [],
  excludedOrders: [],
  excludedMaterials: [],
  excludedTopEdges: [],
  maxOrdersPerBatch: 999,
  groupSplitLimits: {},
  colIndices: null,
  appSettings: loadSettings(),
};

state.maxOrdersPerBatch = parseInt(state.appSettings.maxOrdersPerBatch) || state.maxOrdersPerBatch;

function persistSettings(updates = {}) {
  state.appSettings = {
    ...state.appSettings,
    maxOrdersPerBatch: state.maxOrdersPerBatch,
    ...updates,
  };
  saveSettings(state.appSettings);
}

function rowMaterialName(row) {
  return cleanMaterialName(row[state.colIndices.materialName] || '');
}

function rowTopEdgeName(row) {
  return normalizeTopEdgeName(row[state.colIndices.topEdge] || '');
}

function shouldRoundExportWidths() {
  return !!$('chk-round-export-widths')?.checked;
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const fileName = file.name || '';
    state.appSettings = rememberFile(fileName, state.appSettings);
    persistSettings();
    parseAndLoad(e.target.result);
  };
  reader.onerror = () => alert('Could not read the selected file.');
  reader.readAsText(file);
}

function parseAndLoad(text) {
  const { headers, rows } = parseCSV(text);
  if (headers.length === 0) {
    alert('The CSV file seems to be empty or invalid.');
    return;
  }
  state.parsedHeaders = headers;
  state.parsedRows = rows;
  state.colIndices = mapHeaders(headers);
  normalizeTopEdges(state.parsedRows, state.colIndices);
  defaultFrontTopEdgesFromBacks(state.parsedRows, state.colIndices);
  state.originalParsedRows = state.parsedRows.map((r) => [...r]);
  state.excludedOrders = [];
  state.excludedMaterials = [];
  state.excludedTopEdges = [];
  state.groupSplitLimits = {};
  validateRows();
  rebuild();
}

function validateRows() {
  state.validationErrors = [];
  const ci = state.colIndices;
  state.parsedRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const orderNum = row[ci.orderNumber] || 'Unknown';
    const mat = row[ci.materialName] || '';
    const edge = row[ci.topEdge] || '';
    if (!mat.trim()) {
      state.validationErrors.push(`Row ${lineNum} (Order #${orderNum}) is missing a Material Name.`);
    }
    if (!edge.trim()) {
      state.validationErrors.push(`Row ${lineNum} (Order #${orderNum}) is missing a Top Edge.`);
    }
  });
  renderErrorBanner();
}

function renderErrorBanner() {
  const banner = $('side-error-notification');
  const list = $('error-list');
  if (state.validationErrors.length > 0) {
    list.innerHTML = state.validationErrors.map((e) => `<li>${escapeHTML(e)}</li>`).join('');
    banner.hidden = false;
    list.hidden = true;
  } else {
    banner.hidden = true;
    list.innerHTML = '';
  }
}

function rebuild() {
  state.splitGroups = splitDataIntoGroups(
    state.parsedRows,
    state.colIndices,
    state.maxOrdersPerBatch,
    state.groupSplitLimits
  );
  showWorkspace();
}

function resetData() {
  state.parsedHeaders = [];
  state.parsedRows = [];
  state.originalParsedRows = [];
  state.splitGroups = {};
  state.activeGroupKey = '';
  state.excludedOrders = [];
  state.excludedMaterials = [];
  state.excludedTopEdges = [];
  state.validationErrors = [];
  state.groupSplitLimits = {};
  const fileInput = $('file-input');
  if (fileInput) fileInput.value = '';
  $('workspace-placeholder').style.display = 'flex';
  $('active-workspace').hidden = true;
  $('stats-section').hidden = true;
  $('demo-section').style.display = 'block';
  $('side-error-notification').hidden = true;
  $('batches-sidebar-card').hidden = true;
  $('exclude-order-section').hidden = true;
  $('split-batches-config').hidden = true;
}

function showWorkspace() {
  $('workspace-placeholder').style.display = 'none';
  $('active-workspace').hidden = false;
  $('stats-section').hidden = false;
  $('demo-section').style.display = 'none';
  $('batches-sidebar-card').hidden = false;
  $('exclude-order-section').hidden = false;
  $('split-batches-config').hidden = false;

  let totalQty = 0;
  state.parsedRows.forEach((row) => {
    totalQty += parseInt(row[state.colIndices.quantity]) || 0;
  });
  $('stat-total-rows').innerText = totalQty;
  const uniqueOrders = new Set(state.parsedRows.map((r) => r[state.colIndices.orderNumber]));
  $('stat-orders').innerText = uniqueOrders.size;
  const totalBoxes = Object.values(state.splitGroups).reduce(
    (sum, g) => sum + (g.totalBoxes || 0),
    0
  );
  $('stat-total-boxes').innerText = totalBoxes;

  updateExclusionOptions();
  renderBatchTabs();

  const keys = Object.keys(state.splitGroups).sort();
  if (keys.length > 0) {
    const first = state.activeGroupKey && state.splitGroups[state.activeGroupKey]
      ? state.activeGroupKey
      : keys[0];
    selectGroup(first);
  } else {
    state.activeGroupKey = '';
    $('current-view-title').innerText = 'No Batches Available';
    $('table-head').innerHTML = '';
    $('table-body').innerHTML = '';
    $('stack-table-head').innerHTML = '';
    $('stack-table-body').innerHTML = '';
  }
}

function renderBatchTabs() {
  const container = $('category-tabs');
  container.innerHTML = '';
  let firstActive = '';
  Object.keys(state.splitGroups)
    .sort()
    .forEach((batchKey) => {
      if (!firstActive) firstActive = batchKey;
      const batch = state.splitGroups[batchKey];
      const wrapper = document.createElement('div');
      wrapper.className = 'batch-item';
      wrapper.id = `batch-item-${batchKey}`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'batch-btn';
      btn.id = `tab-${batchKey}`;
      btn.innerHTML = `<span class="batch-name">${escapeHTML(batchKey)}</span><span class="batch-meta">${batch.totalBoxes} Boxes • ${batch.sortedOrders.length} Orders</span>`;
      btn.addEventListener('click', () => selectGroup(batchKey));

      const splitBtn = document.createElement('button');
      splitBtn.type = 'button';
      splitBtn.className = 'batch-del-btn';
      splitBtn.innerText = '✂';
      splitBtn.title = 'Split this material/top-edge group by max orders';
      splitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        splitSingleBatch(batchKey);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'batch-del-btn';
      delBtn.innerText = '✕';
      delBtn.title = 'Delete this batch';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBatch(batchKey);
      });

      wrapper.appendChild(btn);
      wrapper.appendChild(splitBtn);
      wrapper.appendChild(delBtn);
      container.appendChild(wrapper);
    });
}

function selectGroup(batchKey) {
  state.activeGroupKey = batchKey;
  document.querySelectorAll('.batch-item').forEach((item) => item.classList.remove('active'));
  const activeItem = $(`batch-item-${batchKey}`);
  if (activeItem) activeItem.classList.add('active');
  renderCurrentView();
}

function renderCurrentView() {
  const ci = state.colIndices;
  resetCheckboxCounter();
  const batch = state.splitGroups[state.activeGroupKey];
  const tableHead = $('table-head');
  const tableBody = $('table-body');
  const stackHead = $('stack-table-head');
  const stackBody = $('stack-table-body');
  tableHead.innerHTML = '';
  tableBody.innerHTML = '';
  stackHead.innerHTML = '';
  stackBody.innerHTML = '';

  if (!batch) {
    $('current-view-title').innerText = 'No Batches Available';
    return;
  }

  $('current-view-title').innerText = `${state.activeGroupKey}.csv`;

  tableHead.innerHTML = `<tr>${state.parsedHeaders
    .map((h) => `<th>${escapeHTML(h)}</th>`)
    .join('')}</tr>`;

  let bodyHTML = '';
  batch.rows.forEach((row) => {
    bodyHTML += '<tr>';
    row.forEach((cell, idx) => {
      if (idx === ci.materialName) {
        const matName = cleanMaterialName(cell);
        bodyHTML += matName
          ? `<td><span class="badge">${escapeHTML(matName)}</span></td>`
          : `<td><span class="badge badge--danger">⚠️ MISSING MATERIAL</span></td>`;
      } else if (idx === ci.topEdge) {
        const edgeName = (cell || '').trim();
        bodyHTML += edgeName
          ? `<td>${escapeHTML(formatDecimalForDisplay(cell))}</td>`
          : `<td><span class="badge badge--danger">⚠️ MISSING TOP EDGE</span></td>`;
      } else {
        bodyHTML += `<td>${escapeHTML(formatDecimalForDisplay(cell))}</td>`;
      }
    });
    bodyHTML += '</tr>';
  });
  tableBody.innerHTML = bodyHTML;

  stackHead.innerHTML = `
    <tr>
      <th style="width:90px;">Seq</th>
      <th>Front / Back Stack</th>
      <th>Side Stack</th>
    </tr>
  `;
  stackBody.innerHTML = renderStackMatrixRows(batch, ci, false);
}

function updateExclusionOptions() {
  const materialOptions = $('material-options');
  const topEdgeOptions = $('top-edge-options');
  const orderSelect = $('exclude-order-select');
  const materials = Array.from(
    new Set(state.originalParsedRows.map(rowMaterialName).filter(Boolean))
  ).sort();
  const topEdges = Array.from(
    new Set(state.originalParsedRows.map(rowTopEdgeName).filter(Boolean))
  ).sort();
  materialOptions.innerHTML = materials
    .map((m) => `<option value="${escapeAttr(m)}"></option>`)
    .join('');
  topEdgeOptions.innerHTML = topEdges
    .map((e) => `<option value="${escapeAttr(e)}"></option>`)
    .join('');

  if (orderSelect) {
    // Orders still in the batches (excluded ones drop out automatically).
    const orders = Array.from(
      new Set(
        state.parsedRows
          .map((r) => String(r[state.colIndices.orderNumber] || '').trim())
          .filter(Boolean)
      )
    ).sort(orderSortComparator);
    const previous = orderSelect.value;
    orderSelect.innerHTML =
      '<option value="">Select order to remove…</option>' +
      orders
        .map((o) => `<option value="${escapeAttr(o)}">Order #${escapeHTML(o)}</option>`)
        .join('');
    if (orders.includes(previous)) orderSelect.value = previous;
  }
}

function orderSortComparator(a, b) {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}

function applyExclusionsAndRebuild() {
  state.parsedRows = applyExclusions(state.originalParsedRows, state.colIndices, {
    orders: state.excludedOrders,
    materials: state.excludedMaterials,
    topEdges: state.excludedTopEdges,
  });
  rebuild();
  renderExcludedBadges();
}

function renderExcludedBadges() {
  const container = $('excluded-list-container');
  const bag = $('excluded-orders-bag');
  const badges = [];
  state.excludedOrders.forEach((order) => {
    badges.push(
      `<button type="button" class="restore-badge restore-badge--order" data-restore="order" data-value="${escapeAttr(order)}" title="Click to Restore Order">Order #${escapeHTML(order)} <span class="restore-plus">+</span></button>`
    );
  });
  state.excludedMaterials.forEach((material) => {
    badges.push(
      `<button type="button" class="restore-badge restore-badge--material" data-restore="material" data-value="${escapeAttr(material)}" title="Click to Restore Material">Material: ${escapeHTML(material)} <span class="restore-plus">+</span></button>`
    );
  });
  state.excludedTopEdges.forEach((edge) => {
    badges.push(
      `<button type="button" class="restore-badge restore-badge--edge" data-restore="edge" data-value="${escapeAttr(edge)}" title="Click to Restore Top Edge">Edge: ${escapeHTML(edge)} <span class="restore-plus">+</span></button>`
    );
  });
  if (badges.length > 0) {
    container.hidden = false;
    bag.innerHTML = badges.join('');
  } else {
    container.hidden = true;
    bag.innerHTML = '';
  }
}

function excludeOrder() {
  const select = $('exclude-order-select');
  const orderToExclude = (select?.value || '').trim();
  if (!orderToExclude) {
    alert('Please choose an Order Number to remove.');
    return;
  }
  const exists = state.originalParsedRows.some(
    (row) => String(row[state.colIndices.orderNumber] || '').trim() === orderToExclude
  );
  if (!exists) {
    alert(`Order Number #${orderToExclude} not found in the loaded data.`);
    return;
  }
  if (!state.excludedOrders.includes(orderToExclude)) {
    state.excludedOrders.push(orderToExclude);
    applyExclusionsAndRebuild();
  }
  if (select) select.value = '';
}

function excludeMaterial() {
  const input = $('exclude-material-input');
  const materialToExclude = cleanMaterialName(input.value.trim());
  if (!materialToExclude) {
    alert('Please enter or choose a Material to remove.');
    return;
  }
  const exists = state.originalParsedRows.some(
    (row) => rowMaterialName(row).toLowerCase() === materialToExclude.toLowerCase()
  );
  if (!exists) {
    alert(`Material "${materialToExclude}" not found in the loaded data.`);
    return;
  }
  if (
    !state.excludedMaterials.some(
      (m) => m.toLowerCase() === materialToExclude.toLowerCase()
    )
  ) {
    state.excludedMaterials.push(materialToExclude);
    applyExclusionsAndRebuild();
  }
  input.value = '';
}

function excludeTopEdge() {
  const input = $('exclude-top-edge-input');
  const edgeToExclude = normalizeTopEdgeName(input.value.trim());
  if (!edgeToExclude) {
    alert('Please enter or choose a Top Edge to remove.');
    return;
  }
  const exists = state.originalParsedRows.some(
    (row) => rowTopEdgeName(row).toLowerCase() === edgeToExclude.toLowerCase()
  );
  if (!exists) {
    alert(`Top Edge "${edgeToExclude}" not found in the loaded data.`);
    return;
  }
  if (
    !state.excludedTopEdges.some((e) => e.toLowerCase() === edgeToExclude.toLowerCase())
  ) {
    state.excludedTopEdges.push(edgeToExclude);
    applyExclusionsAndRebuild();
  }
  input.value = '';
}

function restoreItem(kind, value) {
  if (kind === 'order') {
    state.excludedOrders = state.excludedOrders.filter((o) => o !== value);
  } else if (kind === 'material') {
    state.excludedMaterials = state.excludedMaterials.filter((m) => m !== value);
  } else if (kind === 'edge') {
    state.excludedTopEdges = state.excludedTopEdges.filter((e) => e !== value);
  }
  applyExclusionsAndRebuild();
}

function updateMaxOrdersSplit() {
  const inputVal = parseInt($('max-orders-input').value);
  if (Number.isNaN(inputVal) || inputVal < 1) {
    alert('Please enter a valid number of orders (minimum 1).');
    return;
  }
  state.maxOrdersPerBatch = inputVal;
  persistSettings();
  rebuild();
}

function splitSingleBatch(batchKey) {
  const batch = state.splitGroups[batchKey];
  if (!batch || !batch.sourceGroupKey) return;
  const currentLimit = state.groupSplitLimits[batch.sourceGroupKey] || state.maxOrdersPerBatch;
  const response = prompt(`Split ${batchKey} by max orders per batch:`, currentLimit);
  if (response === null) return;
  const inputVal = parseInt(response);
  if (Number.isNaN(inputVal) || inputVal < 1) {
    alert('Please enter a valid number of orders (minimum 1).');
    return;
  }
  state.groupSplitLimits[batch.sourceGroupKey] = inputVal;
  persistSettings();
  state.activeGroupKey = '';
  rebuild();
}

function deleteBatch(batchKey) {
  const batch = state.splitGroups[batchKey];
  if (!batch) return;
  if (confirm(`Are you sure you want to delete the batch "${batchKey}"? This will exclude all orders in this batch.`)) {
    (batch.sortedOrders || []).forEach((order) => {
      const orderStr = String(order).trim();
      if (!state.excludedOrders.includes(orderStr)) {
        state.excludedOrders.push(orderStr);
      }
    });
    applyExclusionsAndRebuild();
    alert(`Batch "${batchKey}" deleted (Orders excluded: ${(batch.sortedOrders || []).join(', ')}).`);
  }
}

function filterBatches() {
  const query = $('batch-search-input').value.trim().toLowerCase();
  Object.keys(state.splitGroups).forEach((batchKey) => {
    const batch = state.splitGroups[batchKey];
    const btn = $(`tab-${batchKey}`);
    if (!btn) return;
    const wrapper = btn.parentElement;
    const matchKey = batchKey.toLowerCase().includes(query);
    const matchOrder = batch.sortedOrders.some((order) =>
      String(order).toLowerCase().includes(query)
    );
    wrapper.style.display = matchKey || matchOrder ? 'flex' : 'none';
  });
}

function getExportGroups() {
  const includeExcluded = $('chk-include-excluded-in-export')?.checked;
  if (
    includeExcluded &&
    (state.excludedOrders.length > 0 ||
      state.excludedMaterials.length > 0 ||
      state.excludedTopEdges.length > 0)
  ) {
    // Compute groups from the full (un-excluded) dataset without touching the
    // visible workspace. splitDataIntoGroups is pure, so no re-render is needed.
    return splitDataIntoGroups(
      state.originalParsedRows,
      state.colIndices,
      state.maxOrdersPerBatch,
      state.groupSplitLimits
    );
  }
  return state.splitGroups;
}

function downloadCurrentFile() {
  const exportGroups = getExportGroups();
  const batch = exportGroups[state.activeGroupKey];
  if (!batch) {
    alert('Batch not found for export.');
    return;
  }
  const csv = convertToCSV(
    state.parsedHeaders,
    getCutListRowsForExport(batch.rows, state.colIndices, shouldRoundExportWidths())
  );
  triggerDownload(csv, `${state.activeGroupKey}.csv`);
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadAllZip() {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const exportGroups = getExportGroups();
  let added = false;
  Object.keys(exportGroups).forEach((batchKey) => {
    const batch = exportGroups[batchKey];
    zip.file(
      `${batchKey}.csv`,
      convertToCSV(
        state.parsedHeaders,
        getCutListRowsForExport(batch.rows, state.colIndices, shouldRoundExportWidths())
      )
    );
    added = true;
  });
  if (added) {
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `opticut_splits_${new Date().toISOString().slice(0, 10)}.zip`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function triggerPrintCurrent() {
  const printContainer = $('all-print-container');
  const batch = state.splitGroups[state.activeGroupKey];
  if (!printContainer || !batch) return;
  printContainer.innerHTML = '';
  const cardDiv = document.createElement('div');
  cardDiv.className = 'category-card';
  cardDiv.innerHTML = buildCompactPrintCard(state.activeGroupKey, batch, state.colIndices);
  printContainer.appendChild(cardDiv);
  document.body.classList.add('print-all-active');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('print-all-active');
    printContainer.innerHTML = '';
  }, 1000);
}

function printAllSummaries() {
  const printContainer = $('all-print-container');
  if (!printContainer) return;
  printContainer.innerHTML = '';
  const keys = Object.keys(state.splitGroups).sort();
  keys.forEach((batchKey, idx) => {
    const batch = state.splitGroups[batchKey];
    const cardDiv = document.createElement('div');
    cardDiv.className = 'category-card';
    cardDiv.innerHTML = buildCompactPrintCard(batchKey, batch, state.colIndices, {
      index: idx + 1,
      count: keys.length,
    });
    printContainer.appendChild(cardDiv);
  });
  document.body.classList.add('print-all-active');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('print-all-active');
    printContainer.innerHTML = '';
  }, 1000);
}

function triggerPDF() {
  alert(
    "To save this stack matrix as a PDF, please choose 'Save as PDF' or 'Microsoft Print to PDF' as the Destination in the print dialog that appears next."
  );
  triggerPrintCurrent();
}

function toggleErrorDetails() {
  const details = $('error-list');
  const icon = $('error-toggle-icon');
  const button = $('error-toggle');
  if (details.hidden) {
    details.hidden = false;
    icon.innerText = '▲';
    button.setAttribute('aria-expanded', 'true');
  } else {
    details.hidden = true;
    icon.innerText = '▼';
    button.setAttribute('aria-expanded', 'false');
  }
}

function shareApplication() {
  const url = window.location.href;
  navigator.clipboard
    .writeText(url)
    .then(() => alert('Application URL successfully copied to clipboard!'))
    .catch((err) => {
      console.error('Could not copy text: ', err);
      alert('Failed to copy URL automatically. Here is the link: ' + url);
    });
}

function handleRoundExportWidthToggle(checkbox) {
  if (!checkbox?.checked) {
    alert(
      'Warning: export Width rounding is now OFF. CSV exports will keep original Width values, matching rows may not merge, and the file can have more rows. The stack matrix will still show rounded whole-number widths for operators.'
    );
  }
}

function loadDemoData() {
  parseAndLoad(DEMO_CSV);
}

function wireEvents() {
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
  });
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) processFile(e.target.files[0]);
  });

  $('btn-reset').addEventListener('click', resetData);
  $('btn-download-all').addEventListener('click', downloadAllZip);
  $('btn-export-current').addEventListener('click', downloadCurrentFile);
  $('btn-print-summary').addEventListener('click', triggerPrintCurrent);
  $('btn-print-all-summaries').addEventListener('click', printAllSummaries);
  $('btn-pdf-summary').addEventListener('click', triggerPDF);
  $('btn-share').addEventListener('click', shareApplication);
  $('demo-link').addEventListener('click', loadDemoData);
  $('btn-apply-max-orders').addEventListener('click', updateMaxOrdersSplit);
  $('max-orders-input').value = String(state.maxOrdersPerBatch);
  $('batch-search-input').addEventListener('input', filterBatches);

  $('btn-exclude-order').addEventListener('click', excludeOrder);
  $('btn-exclude-material').addEventListener('click', excludeMaterial);
  $('btn-exclude-top-edge').addEventListener('click', excludeTopEdge);
  $('exclude-material-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') excludeMaterial();
  });
  $('exclude-top-edge-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') excludeTopEdge();
  });

  $('chk-round-export-widths').addEventListener('change', (e) =>
    handleRoundExportWidthToggle(e.target)
  );

  $('error-toggle').addEventListener('click', toggleErrorDetails);

  // Delegated restore-badge clicks
  $('excluded-orders-bag').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-restore]');
    if (!btn) return;
    restoreItem(btn.dataset.restore, btn.dataset.value);
  });

  // Delegated stack-row checkbox toggles
  $('stack-table-body').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-toggle-row]');
    if (!cb) return;
    const row = $(cb.dataset.toggleRow);
    if (row) row.classList.toggle('completed-row', cb.checked);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireEvents();
});
