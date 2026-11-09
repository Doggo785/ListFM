/**
 * The thread's life on the landing page, frame by frame. The page's text stays in the DOM: this reads where it is, draws around it,
 * and only says which scene is on through onChange.
 * The show follows the scroll a little behind, smoothed, and once the scroll stops the page glides to the next beat the way it went,
 * so it always rests on a step that says what it changed. Going back plays it backwards. Only the falling pixels have a memory.
 */
import { dither } from "@/lib/forge";
import { CELL } from "@/lib/pixelRibbon";
import { coverShape } from "@/lib/playlistCover";
import { mix, smoothstep as sstep } from "@/lib/ribbonTrack";
import { createMachine } from "./machine";
import { beatToSettle, chainPhases, clamp, ease, heartbeat, listensUpTo, shareAtBeat, storyAt, storyBeats, timelineShare } from "./story";

export const BREATH_SECONDS = 1.7;
export const FUSE_SECONDS = 1.7;
const INTRO_SECONDS = BREATH_SECONDS + FUSE_SECONDS + 1.2;
const SWEEP_TO_END = 0.9; // Of the listens scene: the playhead has crossed the years by then.
const BAND = 0.47; // Of the screen: where the thread lies through the story.
const LEAN = 0.12;
const SCENE_SHOWS_FROM = 0.6; // Of the story's way in: the first scene is already there as it scrolls up.
const LINE_COMES_IN = 160; // CSS pixels of scroll: a line of the page has its thread by the time it's in view, even at the page's end.
const RECIPE_MORPH = [0.85, 1];
const SCRUB_SECONDS = 0.3; // How long the show takes to catch up with the scroll: smooth, never laggy.
const MAX_BEATS_PER_SECOND = 5; // A fling still shows each step go by.
const SETTLE_AFTER = 0.15; // Seconds of a still scroll before the page settles on a beat.
const settleSeconds = (beats) => clamp(0.3 + 0.4 * beats, 0.3, 0.9);
const glideOut = (k) => 1 - (1 - k) ** 3;
const RECIPE_HEAT = [2, 1, 3];
// Softer than wide, like the site's ribbon: dithered reds, and amber only where something is happening.
const RESTING_SOFTNESS = 1.35;
const RESTING_WIDTH = 0.085; // Of the screen's height, as on the other pages' scenes.
const BAND_SOFTNESS = 1.15;

const number = (n) => n.toLocaleString("en-US");

export function createShow({ stage, demo, root, intro, onChange, onLit }) {
  const find = (name) => root.querySelector(`[data-show="${name}"]`);
  const peak = Math.max(...demo.weeks);
  const sliceFrom = timelineShare(demo.first, demo.weeks, demo.chain.start);
  const sliceTo = timelineShare(demo.first, demo.weeks, demo.chain.end);
  const machine = createMachine(stage, demo.chain);
  const coverLine = coverShape(demo.chain.start).center;
  const beats = storyBeats(demo.runs.length, demo.recipes.length);

  const m = {
    t: intro ? 0 : INTRO_SECONDS,
    passed: null,
    lastP: 0,
    beat: null,
    top: 0,
    idle: 0,
    down: true,
    settle: null,
    lastL: 0,
    lastR: 0,
    y: null,
    pull: 0,
    px: -1,
    py: 0,
    still: 0,
    lastScroll: 0,
    typing: 0,
    forgedAt: null,
    scene: null,
    step: null,
    sceneAt: 0,
    lit: false,
    x0: null,
  };

  const lay = () => {
    machine.layout(stage.H * BAND);
    m.passed = new Float32Array(stage.W).fill(intro ? Number.POSITIVE_INFINITY : -1e6);
  };
  lay();
  stage.onResize = lay;

  const say = (scene, step) => {
    if (scene === m.scene && step === m.step) return;
    if (scene !== m.scene) m.sceneAt = m.t;
    m.scene = scene;
    m.step = step;
    onChange(scene, step);
  };

  const drawHeartbeat = (x, y) => {
    const beat = heartbeat(m.t);
    const appear = Math.min(1, m.t / 0.35);
    const reach = 2 + beat * 11;
    const tones = [stage.e[0], stage.e[1], stage.e[3], stage.e[5], stage.e[7], stage.e[8], stage.cream];
    const r = Math.ceil(reach);
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const d = Math.hypot(dx, dy);
        if (d > reach) continue;
        const v = (1 - d / reach) ** 1.8 * (0.28 + beat * 0.72) * appear;
        const idx = Math.floor(v * tones.length + dither(x + dx, y + dy));
        if (idx >= 1) stage.put(x + dx, y + dy, tones[Math.min(tones.length - 1, idx - 1)]);
      }
    }
  };

  /** A playhead on the thread: the only bright thing on it, losing a pixel now and then. */
  const drawHead = (x, y, mark = stage.put) => {
    for (let dy = -3; dy <= 3; dy += 1) mark(x, y + dy, stage.cream);
    stage.crumb(x, y);
  };

  /** The thread at rest under the name: it rises on the free side, breathes, and leans a little toward a pointer once nothing else happens. */
  const heroThread = (lineY) => {
    const { t, passed } = m;
    const { W, H } = stage;
    return {
      c: (x) => {
        const sweep = sstep(0.55, 1, x / W) * lineY * 0.5 * (1 + 0.15 * Math.sin(x * 0.02 + t * 0.2));
        const base = lineY + 1.2 * Math.sin(x * 0.035 + t * 0.5) + 0.7 * Math.sin(x * 0.09 - t * 0.7) - sweep;
        return base + m.pull * (m.py - base) * Math.exp(-(((x - m.px) / (W * 0.16)) ** 2));
      },
      hw: (x) => {
        const body = H * RESTING_WIDTH * (1 + 0.2 * Math.sin(x * 0.03 + t * 0.6) + 0.08 * Math.sin(x * 0.09 - t * 0.9)) * (1 + 0.7 * sstep(0.55, 1, x / W));
        return mix(0.7, body, sstep(0, 1.1, t - passed[x])) * (1 + 0.05 * Math.sin(t * 1.3));
      },
    };
  };

  const scenes = {
    listens(k, thread) {
      const { W } = stage;
      const head = clamp(k / SWEEP_TO_END) * W;
      const share = head / W;
      stage.thread({ to: head, c: thread.c, hw: thread.years, heat: 2, soft: BAND_SOFTNESS, blaze: (x) => sstep(14, 0, head - x) * 0.5 });
      if (head < W && head > 0) drawHead(head, thread.y);
      const count = find("count");
      if (count) count.textContent = number(share >= 1 ? demo.total : listensUpTo(demo.weeks, share));
      const leaving = 1 - sstep(0.94, 1, k);
      for (const cover of root.querySelectorAll("[data-show-cover]")) {
        const shown = sstep(0, 0.06, share - Number(cover.dataset.showCover)) * leaving;
        cover.style.transform = `translateY(${(1 - shown) * 16}px)`;
        stage.veil(cover.getBoundingClientRect(), shown);
      }
      return null;
    },

    chain(k, thread, p) {
      const { W, H } = stage;
      const ph = chainPhases(k);
      const sliceL = sliceFrom * W;
      const sliceR = Math.max(sliceL + 3, sliceTo * W);
      const L = mix(0, sliceL, ph.window);
      const R = mix(W, sliceR, ph.window);
      if (ph.open < 1) {
        stage.thread({ from: L, to: R, c: thread.c, hw: (x) => thread.years(x) * (1 - ph.open), heat: ph.window >= 1 ? 3 : 2, soft: BAND_SOFTNESS, blaze: ph.window >= 1 ? 0.5 : 0 });
      }
      if (p > m.lastP && ph.window > 0 && ph.window < 1) {
        for (const [front, was] of [[L, m.lastL], [R, m.lastR]]) {
          // What the Window leaves out comes apart: the ribbon sheds its pixels from both ends toward the month it keeps.
          for (let x = Math.min(front, was); x <= Math.max(front, was); x += 1) {
            const half = thread.years(clamp(Math.floor(x), 0, W - 1));
            for (let y = thread.y - half; y < thread.y + half; y += 1) if (Math.random() < 0.08) stage.crumb(x, y);
          }
        }
      }
      m.lastL = L;
      m.lastR = R;
      if (ph.open > 0) machine.draw({ ...ph, from: { x: sliceL, y: H * BAND - 12, w: sliceR - sliceL, h: 24 }, shift: thread.shift });

      const walk = mix(W - 2, (sliceL + sliceR) / 2, ease(ph.scan));
      const marker = find("marker");
      if (marker) {
        marker.style.transform = `translateX(${clamp(walk * CELL, 60, window.innerWidth - 120)}px)`;
        marker.textContent = ph.scan < 0.05 ? "Today" : ph.scan < 1 ? "A year ago..." : demo.chain.label;
      }
      const ticks = find("ticks");
      if (ticks) ticks.style.visibility = ph.window < 0.55 ? "visible" : "hidden";
      if (ph.window < 1) {
        const reach = Math.min(H * 0.15, 34) + 5;
        for (let y = thread.y - reach; y < thread.y + reach; y += 1) if (Math.floor(y) % 3 !== 0) stage.put(walk, y, stage.cream);
      }
      return ph.stage;
    },

    delivered(k, thread) {
      const cover = find("delivered-cover");
      if (!cover) return null;
      const rect = cover.getBoundingClientRect();
      const merge = sstep(0, 0.3, k);
      if (merge < 1) {
        machine.draw({ open: 1, filter: 1, sort: 1, limit: 1, merge, from: { x: 0, y: 0, w: 0, h: 0 }, to: { x: (rect.left + rect.width / 2) / CELL, y: (rect.top + rect.height / 2) / CELL - thread.shift }, shift: thread.shift });
      }
      // The fuse cuts the two albums exactly where the cover's own ribbon lies.
      const cut = sstep(0.25, 0.72, k);
      stage.veil(rect, 0, Math.floor((rect.left + rect.width * cut) / CELL));
      if (cut > 0 && cut < 1) drawHead((rect.left + rect.width * cut) / CELL, (rect.top + rect.height * coverLine(cut)) / CELL, stage.mark);
      const list = find("delivered-list");
      if (list) stage.veil(list.getBoundingClientRect(), sstep(0.6, 0.85, k));
      return null;
    },

    keeps(k, thread) {
      const { W } = stage;
      const count = demo.runs.length;
      const run = Math.min(count - 1, Math.floor(k * count));
      const along = clamp(k * count - run);
      const head = along * W;
      const pulse = (x) => 0.7 + 3 * Math.exp(-(((x - head) / 18) ** 2));
      stage.thread({ c: thread.c, hw: pulse, heat: 3, blaze: (x) => sstep(18, 0, Math.abs(x - head)) * 0.5 });
      if (along > 0 && along < 1) drawHead(head, thread.y);
      for (const slot of root.querySelectorAll("[data-show-slot]")) {
        const index = Number(slot.dataset.showSlot);
        const rect = slot.getBoundingClientRect();
        const landed = index < run ? 1 : index === run ? sstep(0, 0.12, along - (rect.left + rect.width / 2) / window.innerWidth) : 0;
        stage.veil(rect, landed);
      }
      return run;
    },

    obeys(k, thread) {
      const { W } = stage;
      const count = demo.recipes.length;
      const recipe = Math.min(count - 1, Math.floor(k * count));
      const along = clamp(k * count - recipe);
      const shape = demo.recipes[recipe].shape;
      const next = demo.recipes[Math.min(count - 1, recipe + 1)].shape;
      const morph = sstep(RECIPE_MORPH[0], RECIPE_MORPH[1], along);
      const reach = Math.min(stage.H * 0.13, 30);
      const at = (series, x) => series[Math.min(series.length - 1, Math.floor((x / W) * series.length))] / 100;
      stage.thread({
        c: thread.c,
        hw: (x) => 0.7 + reach * mix(at(shape, x), at(next, x), morph) ** 0.8 * (1 + 0.03 * Math.sin(x * 0.2 + m.t * 2)),
        heat: RECIPE_HEAT[recipe % RECIPE_HEAT.length],
        soft: BAND_SOFTNESS,
      });
      return recipe;
    },
  };

  /** A thread lying along one line of the page, from the left edge up to `to`. It comes in as the line scrolls into view. */
  const lineThread = (line, to, level) => {
    const rect = line.getBoundingClientRect();
    if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return null;
    const y = (rect.top + rect.height / 2) / CELL;
    const reach = sstep(window.innerHeight, window.innerHeight - LINE_COMES_IN, rect.top) * to;
    const half = rect.height / 2 / CELL;
    stage.thread({
      to: reach,
      c: (x) => y + 0.8 * Math.sin(x * 0.04 + m.t * 0.6),
      hw: (x) => (0.7 + half * (0.7 + 0.2 * Math.sin(x * 0.05 + m.t * 0.7))) * (1 + level * 0.3),
      heat: 2 + Math.round(level),
      soft: RESTING_SOFTNESS,
      blaze: level * 0.5,
    });
    return { y, reach };
  };

  return {
    /** Where the fuse is, in cells, for the name it sets alight. */
    fuseHead: (seconds) => mix(m.x0 ?? 0, stage.W, sstep(0, FUSE_SECONDS, seconds)),
    forgeHead: (seconds) => mix(0, stage.W, sstep(0, FUSE_SECONDS, seconds)),
    // The forge's own sparks: the name is the one thing on this page allowed to burn, so these alone rise.
    sparkAt: (x, y) => stage.crumb(x, y, { vy: -40 - Math.random() * 70, g: 30, life: 0.4 + Math.random() * 0.7 }),
    pointer: (x, y) => {
      m.px = x / CELL;
      m.py = y / CELL;
      m.still = Math.max(m.still, 0.7);
    },
    keystroke: () => {
      m.typing = 1;
    },
    forged: () => {
      m.forgedAt = m.t;
    },

    frame(dt) {
      m.t += dt;
      const { W, H } = stage;
      if (root.scrollTop > 40 && m.t < INTRO_SECONDS) m.t = INTRO_SECONDS;
      const t = m.t;
      const vh = window.innerHeight;

      const nameBox = find("name");
      const lineBox = find("line");
      const story = find("story");
      const pin = find("pin");
      if (!nameBox || !lineBox || !story || !pin) return;
      const lineRect = lineBox.getBoundingClientRect();
      const storyRect = story.getBoundingClientRect();
      const lineY = (lineRect.top + lineRect.height / 2) / CELL;
      const enter = 1 - sstep(0, vh * 0.85, storyRect.top);
      const span = Math.max(1, storyRect.height - vh);
      const at = clamp(-storyRect.top / span) * (beats.length - 1);
      // The visitor's own scroll, not the page's settling, gives the way and wakes the wait.
      if (root.scrollTop !== m.top) {
        if (m.settle && Math.abs(root.scrollTop - m.settle.set) > 1) m.settle = null;
        if (!m.settle) {
          m.down = root.scrollTop > m.top;
          m.idle = 0;
        }
      } else {
        m.idle += dt;
      }
      if (m.settle) {
        m.settle.t += dt;
        const k = clamp(m.settle.t / m.settle.seconds);
        root.scrollTop = mix(m.settle.from, m.settle.to, glideOut(k));
        m.settle.set = root.scrollTop;
        if (k >= 1) m.settle = null;
      } else if (m.idle > SETTLE_AFTER && enter >= 1 && at > 0 && at < beats.length - 1) {
        const beat = beatToSettle(beats.length, at, m.down);
        const to = root.scrollTop + storyRect.top + (beat / (beats.length - 1)) * span;
        if (Math.abs(to - root.scrollTop) > 1) m.settle = { from: root.scrollTop, to, t: 0, seconds: settleSeconds(Math.abs(beat - at)), set: root.scrollTop };
      }
      m.top = root.scrollTop;
      // Arriving mid-story, after a reload, shows that beat at once; after that the show eases after the scroll.
      if (m.beat === null || enter < SCENE_SHOWS_FROM) m.beat = at;
      const catchUp = (at - m.beat) * (1 - Math.exp(-dt / SCRUB_SECONDS));
      m.beat += clamp(catchUp, -MAX_BEATS_PER_SECOND * dt, MAX_BEATS_PER_SECOND * dt);
      const p = shareAtBeat(beats, m.beat);
      const shift = pin.getBoundingClientRect().top / CELL;
      const { scene, k } = storyAt(p);

      if (m.x0 === null) m.x0 = Math.floor(nameBox.getBoundingClientRect().left / CELL) + 2;
      if (t >= BREATH_SECONDS && !m.lit) {
        m.lit = true;
        onLit();
      }
      const fuse = t - BREATH_SECONDS;
      const head = fuse <= 0 ? m.x0 : mix(m.x0, W, sstep(0, FUSE_SECONDS, fuse));
      const tail = fuse <= 0 ? m.x0 : mix(m.x0, 0, sstep(0, FUSE_SECONDS * 0.7, fuse));
      for (let x = Math.max(0, Math.floor(tail)); x < Math.min(W, Math.ceil(head)); x += 1) if (m.passed[x] === Number.POSITIVE_INFINITY) m.passed[x] = t;

      if (root.scrollTop !== m.lastScroll) m.still = 0;
      m.lastScroll = root.scrollTop;
      m.still += dt;
      m.typing = Math.max(0, m.typing - dt * 1.4);
      const leaning = enter < 0.05 && m.px >= 0 && m.still > 0.6 && fuse > FUSE_SECONDS ? LEAN : 0;
      m.pull += (leaning - m.pull) * (1 - Math.exp(-dt * 2));

      const keepsLine = scene === "keeps" ? find("keeps-line") : null;
      const wanted = keepsLine ? (keepsLine.getBoundingClientRect().top + keepsLine.offsetHeight / 2) / CELL - shift : H * BAND;
      m.y = m.y === null ? wanted : m.y + (wanted - m.y) * (1 - Math.exp(-dt * 5));
      const thread = {
        y: m.y + shift,
        shift,
        c: (x) => m.y + shift + 0.5 * Math.sin(x * 0.04 + t * 0.6),
        years: (x) => {
          const week = demo.weeks[Math.min(demo.weeks.length - 1, Math.floor((x / W) * demo.weeks.length))];
          return 0.8 + Math.min(H * 0.15, 34) * (week / peak) ** 1.15 * (1 + 0.03 * Math.sin(x * 0.2 + t * 2));
        },
      };

      if (fuse <= 0) {
        drawHeartbeat(m.x0, Math.floor(lineY));
      } else if (enter < 1) {
        const hero = heroThread(lineY);
        const eased = ease(enter);
        stage.thread({
          from: tail,
          to: head,
          c: (x) => mix(hero.c(x), thread.c(x), eased),
          hw: (x) => mix(hero.hw(x), 0.7, eased),
          heat: 2,
          soft: mix(RESTING_SOFTNESS, 0.82, eased),
          blaze: (x) => sstep(0.9, 0.1, t - m.passed[x]),
        });
        if (head < W) drawHead(head, hero.c(head));
      }
      let step = null;
      if (enter >= SCENE_SHOWS_FROM && storyRect.bottom > 0) {
        if (enter >= 1) stage.thread({ c: thread.c, hw: () => 0.7, heat: 1 });
        step = scenes[scene](k, thread, p);
      }

      const turnLine = find("turn-line");
      if (turnLine) {
        const lit = lineThread(turnLine, W, m.typing);
        if (lit && m.forgedAt !== null && t - m.forgedAt < FUSE_SECONDS) {
          const at = mix(0, W, sstep(0, FUSE_SECONDS, t - m.forgedAt));
          drawHead(at, lit.y);
          const forged = find("turn-name");
          if (forged) {
            const r = forged.getBoundingClientRect();
            stage.veil({ left: r.left, right: r.right, top: r.top - 100, bottom: r.bottom + 4 }, 0, Math.floor(at));
          }
        }
      }
      const endLine = find("end-line");
      const endButton = find("end-button");
      if (endLine && endButton) lineThread(endLine, endButton.getBoundingClientRect().left / CELL - 4, 0.4);

      stage.crumbs(dt);

      // Nothing else is there until the thread reaches it.
      if (t < INTRO_SECONDS) {
        const r = nameBox.getBoundingClientRect();
        stage.veil({ left: r.left, right: r.right, top: r.top - 100, bottom: r.bottom + 4 }, 0, fuse > 0 ? Math.floor(head) : -1);
        const shown = sstep(BREATH_SECONDS + 0.75, BREATH_SECONDS + 1.45, t);
        if (shown < 1) for (const name of ["promise", "bar"]) stage.veil(find(name).getBoundingClientRect(), shown);
      }
      // A scene's text comes in as dither, at once: it never makes anyone wait.
      const entering = sstep(0, 0.35, t - m.sceneAt);
      if (enter >= 1 && entering < 1) for (const element of root.querySelectorAll("[data-reveal]")) stage.veil(element.getBoundingClientRect(), entering);

      m.lastP = p;
      say(enter >= SCENE_SHOWS_FROM ? scene : "hero", step);
    },
  };
}
