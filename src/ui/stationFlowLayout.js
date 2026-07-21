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

/**
 * Rebuild every cut-list flow into up to three balanced columns.
 * Full monitor width only when all three columns have content; a single
 * column stays ~1/3 width so tables are not stretched edge-to-edge.
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
