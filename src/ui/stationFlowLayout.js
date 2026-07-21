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
 * Merge continuation fragments of the same order back into one table so a
 * short order is not left split across columns with empty space below.
 * @param {Element[]} fragments
 * @returns {Element[]}
 */
export function mergeStationOrderFragments(fragments) {
  const primaryByKey = new Map();
  const orderKeys = [];

  (fragments || []).forEach((frag) => {
    const titleEl = frag.querySelector('.cutlist-order-title');
    const titleText = titleEl?.textContent || '';
    const key = stationOrderFragmentKey(titleText) || `frag-${orderKeys.length}`;

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
