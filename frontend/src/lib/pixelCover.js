export const MARGIN = 3; // Cells of room around the number for the loose pixels.
// Chance of a pixel at this distance from the digits: sure close by, so they stay hidden, then scattering out.
const SPREAD = [1, 1, 0.3, 0.1];

/**
 * The cells to cover, as [x, y] from the box's top-left: on and around the inked ones, so the cloud
 * takes the digits' shape instead of their box. With no ink known, the whole box.
 */
export function coverCells(inked, cols, rows, random = Math.random) {
  const cells = [];
  const box = [];
  for (let y = -MARGIN; y < rows + MARGIN; y += 1) {
    for (let x = -MARGIN; x < cols + MARGIN; x += 1) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) box.push([x, y]);
      let distance = SPREAD.length;
      for (const [ix, iy] of inked) distance = Math.min(distance, Math.max(Math.abs(ix - x), Math.abs(iy - y)));
      if (distance < SPREAD.length && random() < SPREAD[distance]) cells.push([x, y]);
    }
  }
  return inked.length ? cells : box;
}
