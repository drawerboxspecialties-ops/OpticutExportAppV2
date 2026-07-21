/** Station always shows this many side-by-side columns. */
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

/**
 * Rebuild every cut-list flow in `root` into exactly three balanced columns
 * that span the full station width. Works on already-sent (old) HTML too.
 * @param {ParentNode} root
 * @param {number} [columnCount]
 */
export function balanceStationFlowColumns(root, columnCount = STATION_FLOW_COLUMNS) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll('.cutlist-print-flow').forEach((flow) => {
    const fragments = [...flow.querySelectorAll('.cutlist-order-fragment')];
    if (!fragments.length) return;

    const items = fragments.map((el) => ({ cost: fragmentCost(el) }));
    const assignment = assignFragmentsToColumns(items, columnCount);

    const band = document.createElement('div');
    band.className = 'cutlist-print-columns';
    band.style.setProperty('--station-flow-cols', String(columnCount));

    for (let c = 0; c < columnCount; c++) {
      const col = document.createElement('div');
      col.className = 'cutlist-order-column';
      assignment[c].forEach((fragIndex) => {
        col.appendChild(fragments[fragIndex]);
      });
      band.appendChild(col);
    }

    flow.replaceChildren(band);
  });
}
