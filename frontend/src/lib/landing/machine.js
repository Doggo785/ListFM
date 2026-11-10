/** The chain made visible: every track of the real month as one square, driven only by how far the visitor has scrolled, so it runs backwards too. */
import { mix, smoothstep } from "@/lib/ribbonTrack";
import { clamp, ease, hash } from "./story";

const NARROW = 160; // Cells across: below this a square is one cell, or a month wouldn't fit a phone.
const OVERSHOOT = 0.12; // Of the block: how far the Filters' sweep goes on, so the last rejected tracks finish falling.
const FALL = 46;
const BAR_ROWS = 7;

export function createMachine(stage, chain) {
  const { plays, kept, size } = chain;
  const tones = [stage.e[1], stage.e[2], stage.e[3], stage.e[4], stage.e[5], stage.e[6], stage.e[7], stage.e[8], stage.cream];
  const peak = Math.log(Math.max(2, plays[0]));
  const tracks = plays.map((count, rank) => ({
    rank,
    keep: rank < kept,
    final: rank < size,
    color: tones[Math.min(tones.length - 1, Math.floor((Math.log(count) / peak) * (tones.length - 0.01)))],
    stagger: hash(rank, 3),
    arc: (hash(rank, 7) - 0.5) * 34,
    fx: hash(rank, 11),
    fy: hash(rank, 13),
    gx: 0,
    gy: 0,
    sx: 0,
    sy: 0,
  }));
  // A fixed shuffle: a month's plays come scattered, not already in order.
  const slots = tracks.map((_, i) => i).sort((a, b) => hash(a, 21) - hash(b, 21));
  const geo = { size: 1 };
  let last = { filter: 0, limit: 0 };

  const layout = (bandY) => {
    const { W } = stage;
    const pitch = W < NARROW ? 2 : 3;
    geo.size = W < NARROW ? 1 : 2;
    const cols = Math.floor((W * 0.84) / pitch);
    const rows = Math.ceil(tracks.length / cols);
    const left = Math.floor((W - cols * pitch) / 2);
    const top = Math.floor(bandY - (rows * pitch) / 2);
    const barCols = Math.min(Math.floor((W * 0.86) / pitch), Math.ceil(kept / BAR_ROWS));
    const barRows = Math.ceil(kept / barCols);
    const barLeft = Math.floor((W - barCols * pitch) / 2);
    const barTop = Math.floor(bandY - (barRows * pitch) / 2);
    tracks.forEach((track, i) => {
      track.gx = left + (slots[i] % cols) * pitch;
      track.gy = top + Math.floor(slots[i] / cols) * pitch;
      if (track.keep) {
        track.sx = barLeft + Math.floor(track.rank / barRows) * pitch;
        track.sy = barTop + (track.rank % barRows) * pitch;
      }
    });
    Object.assign(geo, {
      left,
      right: left + cols * pitch,
      top,
      bottom: top + rows * pitch,
      barLeft,
      barRight: barLeft + barCols * pitch,
      barTop,
      barBottom: barTop + barRows * pitch,
      cutX: barLeft + Math.ceil(size / barRows) * pitch - 1,
    });
  };

  /** open, filter, sort, limit and merge each run from 0 to 1. `from` is where the squares come out of, `to` where the last ones go. */
  const draw = ({ open, filter, sort, limit, merge = 0, from, to, shift = 0 }) => {
    const span = geo.right - geo.left;
    const sweepAt = (k) => mix(geo.left - 6, geo.right + span * OVERSHOOT, k);
    const frontAt = (k) => mix(geo.barRight + 2, geo.cutX, k);
    const sweep = sweepAt(filter);
    const lastSweep = sweepAt(last.filter);
    const front = frontAt(limit);
    const lastFront = frontAt(last.limit);

    for (const track of tracks) {
      const k = ease(clamp(open * 1.7 - track.stagger * 0.7));
      let x = mix(from.x + track.fx * from.w, track.gx, k);
      let y = mix(from.y + track.fy * from.h, track.gy, k);
      if (!track.keep) {
        const age = (sweep - track.gx) / (span * OVERSHOOT * 0.85);
        if (age >= 1) continue;
        if (age > 0) {
          if (filter > last.filter && lastSweep <= track.gx) {
            stage.crumb(track.gx, track.gy);
          }
          y = track.gy + age * age * FALL;
          if (hash(track.rank, Math.floor(age * 9)) < age) continue; // It comes apart on the way down.
        }
      } else {
        const s = ease(clamp(sort * 1.45 - (track.rank / kept) * 0.45));
        if (s > 0) {
          x = mix(track.gx, track.sx, s);
          y = mix(track.gy, track.sy, s) + Math.sin(Math.PI * s) * track.arc;
        }
        if (!track.final && track.sx > front) {
          if (limit > last.limit && track.sx <= lastFront) {
            for (let i = 0; i < 2; i += 1) stage.crumb(track.sx + i, track.sy);
          }
          continue;
        }
        if (merge > 0) {
          if (!track.final || merge >= 1) continue;
          const m = ease(clamp(merge * 1.4 - (track.rank / size) * 0.4));
          x = mix(track.sx, to.x, m);
          y = mix(track.sy, to.y, m);
        }
      }
      for (let a = 0; a < geo.size; a += 1) for (let b = 0; b < geo.size; b += 1) stage.put(x + a, y + shift + b, track.color);
    }

    // The sweep that reads each track: the thread itself, stood on end for a moment.
    if (filter > 0 && sweep < geo.right + 6) {
      for (let y = geo.top - 5; y < geo.bottom + 5; y += 1) {
        if (hash(y, Math.floor(sweep * 3)) < 0.8) stage.put(sweep, y + shift, stage.e[7]);
      }
    }
    // The blade.
    if (limit > 0 && merge <= 0) {
      const flash = smoothstep(0, 0.06, limit);
      for (let y = geo.barTop - 8; y < geo.barBottom + 8; y += 1) {
        if (hash(y, 91) < flash) stage.put(geo.cutX, y + shift, limit < 1 ? stage.cream : stage.e[7]);
      }
    }
    last = { filter, limit };
  };

  return { layout, draw, geo, tracks };
}
