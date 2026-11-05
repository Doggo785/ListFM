/** The Dashboard's ribbon: listens turned into its width, and the arc its cards fly on. Maths only. */

export const SAMPLES_PER_MONTH = 32;
const NEIGHBOUR_DAYS = 3;
const RAW_SHARE = 0.3; // The rest is the days around: a lone day still shows, without turning the ribbon into a comb.
const CONTRAST = 1.15;
const NO_RUNS = 0.1;
const CARD_GAP = 0.06; // Of a card, along the arc.

const clamp01 = (value) => Math.min(1, Math.max(0, value));
export const smoothstep = (from, to, value) => {
  const k = clamp01((value - from) / (to - from));
  return k * k * (3 - 2 * k);
};
export const mix = (a, b, k) => a + (b - a) * k;

/** The months' daily listens as bytes, one month taking SAMPLES_PER_MONTH whatever its length, so a card covers a month exactly. */
export function monthSeries(months) {
  const days = months.flatMap((month) => month.days);
  const soft = days.map((count, i) => {
    const near = days.slice(Math.max(0, i - NEIGHBOUR_DAYS), i + NEIGHBOUR_DAYS + 1);
    return RAW_SHARE * count + ((1 - RAW_SHARE) * near.reduce((sum, n) => sum + n, 0)) / near.length;
  });
  const peak = Math.max(1, ...soft);
  const out = new Uint8Array(months.length * SAMPLES_PER_MONTH);
  let first = 0;
  months.forEach((month, m) => {
    for (let s = 0; s < SAMPLES_PER_MONTH; s += 1) {
      const day = first + Math.floor((s / SAMPLES_PER_MONTH) * month.days.length);
      out[m * SAMPLES_PER_MONTH + s] = Math.round(255 * (soft[day] / peak) ** CONTRAST);
    }
    first += month.days.length;
  });
  return out;
}

/** Where the listens stop, counted in months: the current month is cut at its last listen. */
export function monthsEnd(months) {
  const last = months.at(-1);
  if (!last) return 0;
  return months.length - 1 + (last.days.findLastIndex((count) => count > 0) + 1) / last.days.length;
}

/** One stretch per automation, its width following the size of its playlists in order. Log scale: 5 next to 500 still shows. */
export function runsSeries(runs) {
  const peak = Math.max(1, ...runs.flat());
  const out = new Uint8Array(runs.length * SAMPLES_PER_MONTH);
  runs.forEach((sizes, m) => {
    for (let s = 0; s < SAMPLES_PER_MONTH; s += 1) {
      const size = sizes.length ? sizes[Math.floor((s / SAMPLES_PER_MONTH) * sizes.length)] : 0;
      const width = size ? Math.log1p(size) / Math.log1p(peak) : NO_RUNS;
      out[m * SAMPLES_PER_MONTH + s] = Math.round(255 * width);
    }
  });
  return out;
}

/** The drum the cards ride on, sized so its silhouette stays outside the viewport. */
export function deckLayout(viewportWidth, card) {
  const radius = Math.max(viewportWidth * 0.76, card * 2.4);
  return {
    radius,
    perspective: viewportWidth * 1.2 + card,
    step: (card * (1 + CARD_GAP)) / radius,
    bow: card * 1.9,
    roll: 0.06,
    turn: 0.36, // Radians a neighbour turns beyond the drum's own angle: its far edge visibly recedes.
    sink: card * 0.85, // How far back it sits, so the card in front is the only one at full size.
  };
}

/** Screen scale of a point at this angle: 1 in front, smaller as it recedes. */
export function drumScale(theta, { radius, perspective }) {
  return perspective / (perspective + radius * (1 - Math.cos(theta)));
}

/** Screen distance from the drum's centre of a point at this angle. */
export const drumX = (theta, layout) => layout.radius * Math.sin(theta) * drumScale(theta, layout);

/** The angle seen at a screen distance from the centre: drumX's inverse. The shader holds the same formula. */
export function drumAngle(x, { radius, perspective }) {
  const room = (perspective * radius) ** 2 - (perspective + 2 * radius) * perspective * x * x;
  return 2 * Math.atan((perspective * x) / (perspective * radius + Math.sqrt(Math.max(0, room))));
}

/** Where a card sits when `focus` is the card facing us (fractional while flying). */
export function cardPose(index, focus, layout) {
  const theta = (index - focus) * layout.step;
  // Nothing at the focus: the card facing us stays flat and whole, and only leaves that pose as it flies.
  const away = smoothstep(0, layout.step, Math.abs(theta));
  return { theta, arc: layout.bow * (1 - Math.cos(theta)), roll: theta * layout.roll, turn: Math.sign(theta) * layout.turn * away, sink: layout.sink * away };
}

/** A flying card's corners on screen, clockwise from its top left: the same maths as its CSS transform. */
export function cardCorners({ x, y, depth, theta, turn = 0, roll, size, originX, originY, layout }) {
  const half = size / 2;
  return [[-half, -half], [half, -half], [half, half], [-half, half]].map(([px, py]) => {
    const a = px * Math.cos(roll) - py * Math.sin(roll);
    const b = px * Math.sin(roll) + py * Math.cos(roll);
    const worldX = x + a * Math.cos(theta + turn) + layout.radius * Math.sin(theta);
    const worldZ = depth - a * Math.sin(theta + turn) + layout.radius * Math.cos(theta);
    const scale = layout.perspective / (layout.perspective - worldZ);
    return { x: originX + (worldX - originX) * scale, y: originY + (y + b - originY) * scale };
  });
}

/** The ribbon's position in months at a screen x. `zoom` goes from the whole year across the screen to the drum. */
export function monthAt(x, track) {
  const flat = (x - track.x0) / track.perMonth;
  if (track.zoom <= 0) return flat;
  return mix(flat, track.focus + 0.5 + drumAngle(x - track.cx, track.layout) / track.layout.step, track.zoom);
}

/** The playhead's share of its way, from 0 to 1, `seconds` after it left. */
export const SWEEP_SECONDS = 1.7;
export const sweepAt = (seconds) => smoothstep(0, SWEEP_SECONDS, seconds);
