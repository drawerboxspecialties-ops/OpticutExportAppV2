/**
 * Map CSV header names to column indices.
 *
 * Header matching is case-insensitive and ignores spaces, underscores, and hyphens
 * so Allmoxy export variants (e.g. "Order Number" vs "OrderNumber") map correctly.
 *
 * Falls back to the historical positional defaults (0..8) when a column cannot be
 * detected by name, matching the original index.html behavior.
 *
 * @param {string[]} headers
 * @returns {{
 *   orderNumber: number,
 *   materialName: number,
 *   partName: number,
 *   w: number,
 *   length: number,
 *   quantity: number,
 *   label: number,
 *   width: number,
 *   topEdge: number,
 * }}
 */
export function mapHeaders(headers) {
  const headersLower = headers.map((h) => h.toLowerCase().trim().replace(/[\s_-]/g, ''));

  const colIndices = {
    orderNumber: headersLower.findIndex((h) => h.includes('ordernumber') || h.includes('order') || h.includes('invoice')),
    materialName: headersLower.findIndex((h) => h.includes('materialname') || h.includes('material') || h.includes('species')),
    partName: headersLower.findIndex((h) => h.includes('partname') || h === 'part' || h === 'name'),
    w: headersLower.findIndex((h) => h === 'w' || h === 'thickness' || h === 'thick'),
    length: headersLower.findIndex((h) => h === 'length' || h === 'len' || h === 'depth'),
    quantity: headersLower.findIndex((h) => h.includes('quantity') || h.includes('qty') || h.includes('pieces')),
    label: headersLower.findIndex((h) => h.includes('label')),
    // lastIndexOf so the second "Width" column (the drawer height) wins over a stray
    // earlier "width" header — mirrors the original implementation exactly.
    width: headersLower.lastIndexOf('width'),
    topEdge: headersLower.findIndex((h) => h.includes('topedge') || h.includes('edge')),
  };

  if (colIndices.orderNumber === -1) colIndices.orderNumber = 0;
  if (colIndices.materialName === -1) colIndices.materialName = 1;
  if (colIndices.partName === -1) colIndices.partName = 2;
  if (colIndices.w === -1) colIndices.w = 3;
  if (colIndices.length === -1) colIndices.length = 4;
  if (colIndices.quantity === -1) colIndices.quantity = 5;
  if (colIndices.label === -1) colIndices.label = 6;
  if (colIndices.width === -1) colIndices.width = 7;
  if (colIndices.topEdge === -1) colIndices.topEdge = 8;

  // Prevent thickness (W) from colliding with drawer Height (Width), which would
  // blank out the Height on consolidated rows. This is a documented careful rule.
  if (colIndices.w === colIndices.width) {
    colIndices.w = -1;
  }

  return colIndices;
}
