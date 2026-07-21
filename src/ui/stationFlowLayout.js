/** Max side-by-side columns on the station monitor. */
export const STATION_FLOW_COLUMNS = 3;

/**
 * Place fragments into columns by shortest height (row-cost).
 * @param {Array<{ cost: number }>} items
 * @param {number} [columnCount]
 * @returns {number[][]} column index → item indices
 */
export function assignFragmentsToColumns(items, columnCount = STATION_FLOW_COLUMNS) {
  const columns = Array.from({ length: columnCount }, () => []);
  const used = Array.from({ length: columnCount }, () => 0);
  (items || []).forEach((item, index) => {
    let best = 0;
    for (let i = 1; i < columnCount; i++) {
      if (used[i] < used[best]) best = i;
    }
    columns[best].push(index);
    used[best] += Math.max(1, item?.cost || 1);
  });
  return columns;
}

function fragmentCost(el) {
  const rows = el.querySelectorAll('tbody tr').length;
  return 2 + rows;
}

/** Pull the order id from a fragment title ("Order 602947 - …" / "(cont.)"). */
export function stationOrderFragmentKey(titleText) {
  const text = String(titleText || '').trim();
  const match = text.match(/order\s+([^\s(]+)/i);
  if (match) return match[1].replace(/[,\s]+$/g, '').toLowerCase();
  return text.replace(/\s*\(cont\.\)\s*/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Stable order key for a fragment: data-order, title, or first row id.
 * @param {Element} frag
 * @returns {string}
 */
export function stationOrderKeyFromFragment(frag) {
  const dataOrder = frag?.getAttribute?.('data-order');
  if (dataOrder) return String(dataOrder).trim().toLowerCase();

  const titleText = frag?.querySelector?.('.cutlist-order-title')?.textContent || '';
  const fromTitle = stationOrderFragmentKey(titleText);
  if (fromTitle) return fromTitle;

  const rowId =
    frag?.querySelector?.('tr[data-row-id], [data-row-id]')?.getAttribute('data-row-id') || '';
  if (!rowId) return '';
  const parts = rowId.split('|');
  if (parts[0] === 't') return String(parts[1] || '').trim().toLowerCase();
  return String(parts[0] || '').trim().toLowerCase();
}

/**
 * Merge continuation fragments of the same order back into one table so a
 * short order is not left split across columns with empty space below.
 * @param {Element[]} fragments
 * @returns {Element[]}
 */
export function mergeStationOrderFragments(fragments) {
  const primaryByKey = new Map();
  const orderKeys = [];

  (fragments || []).forEach((frag, index) => {
    const key = stationOrderKeyFromFragment(frag) || `frag-${index}`;

    if (!primaryByKey.has(key)) {
      primaryByKey.set(key, frag);
      orderKeys.push(key);
      return;
    }

    const primary = primaryByKey.get(key);
    const tbody = primary.querySelector('tbody');
    if (!tbody) return;
    frag.querySelectorAll('tbody tr').forEach((row) => {
      tbody.appendChild(row);
    });
  });

  return orderKeys.map((key) => primaryByKey.get(key)).filter(Boolean);
}

/** True when any order is still split with a "(cont.)" title. */
export function stationFlowNeedsOrderMerge(root) {
  if (!root?.querySelectorAll) return false;
  return [...root.querySelectorAll('.cutlist-order-title')].some((el) =>
    /\(cont\.\)/i.test(el.textContent || '')
  );
}

/**
 * Rebuild every cut-list / trim flow into up to three columns.
 * Keeps each order together; uses extra columns for additional orders.
 * Full monitor width only when multiple columns have content.
 * @param {ParentNode} root
 * @param {number} [columnCount]
 */
export function balanceStationFlowColumns(root, columnCount = STATION_FLOW_COLUMNS) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('.cutlist-print-flow').forEach((flow) => {
    const raw = [...flow.querySelectorAll('.cutlist-order-fragment')];
    if (!raw.length) return;

    const fragments = mergeStationOrderFragments(raw);
    const items = fragments.map((el) => ({ cost: fragmentCost(el) }));
    const assignment = assignFragmentsToColumns(items, columnCount);
    const filled = assignment.filter((indexes) => indexes.length > 0);
    const usedCols = Math.max(1, filled.length);

    const band = document.createElement('div');
    band.className = 'cutlist-print-columns';
    band.style.setProperty('--station-flow-cols', String(usedCols));

    filled.forEach((indexes) => {
      const col = document.createElement('div');
      col.className = 'cutlist-order-column';
      indexes.forEach((fragIndex) => {
        col.appendChild(fragments[fragIndex]);
      });
      band.appendChild(col);
    });

    flow.replaceChildren(band);
  });
}
