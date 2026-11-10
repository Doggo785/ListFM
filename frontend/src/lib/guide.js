/**
 * The newcomer's guide: its steps on the real screens, and where the viewer is in it.
 * Finished or skipped is kept on the account (PUT /api/auth/me/guide); the step in progress only in this browser.
 */
import { useSyncExternalStore } from "react";
import { timeLeft } from "@/lib/backgroundWork";

const KEY = "listfm.guide";
export const EDITOR = "/automations/new";
const AUTOMATION = /^\/automations\/[0-9a-f-]{36}$/;
const ACCURACY = "For accurate results, wait until your import is over.";

/** What the words depend on, from the sync status and what the editor's preview says. */
export function guideContext(status, preview = {}) {
  const importing = Boolean(status && !status.complete && status.stage !== "error");
  return {
    importing,
    tagging: Boolean(status?.tags_total),
    left: importing ? timeLeft(status.eta_seconds) : null,
    empty: Boolean(preview.empty),
    partial: Boolean(preview.partial),
  };
}

/**
 * route: where the step lives. target: what it points at (none: the bubble stands on its own).
 * needs: the editor field it waits for. goes: the step ends with the user's own click, which opens the next page.
 */
export const STEPS = [
  {
    id: "status",
    route: "/dashboard",
    target: ".background-task",
    title: (c) => (c.importing ? "Your listens are on their way" : "Your listens are in"),
    text: (c) =>
      c.importing
        ? `ListFM is reading your Last.fm history, newest first${c.left ? `: ${c.left}` : ""}. It carries on without you, so let's set up your first playlist meanwhile.`
        : "ListFM has read your Last.fm history. Let's set up your first playlist.",
  },
  {
    id: "flame",
    route: "/dashboard",
    target: ".poster__line",
    title: () => "This is your thread",
    text: () => "Here it burns as a flame with your listening: the more you played, the higher it climbs. It follows you from page to page, and grows as your history comes in.",
  },
  {
    id: "new",
    route: "/dashboard",
    target: '.poster a[href="/automations/new"]',
    goes: EDITOR,
    title: () => "Playlists that make themselves",
    text: () => "An automation is a recipe: which listens, in what order, how often. You write it once, and ListFM makes the playlists.",
    action: "Open New automation",
  },
  {
    id: "window",
    route: EDITOR,
    target: '[data-guide-step="window"]',
    needs: "window",
    title: () => "Pick a window",
    text: () => "Which part of your history should it draw from? The last 3 months, a whole year, the same month a year ago…",
    action: "Choose a window",
  },
  {
    id: "refine",
    route: EDITOR,
    target: '[data-guide-step="refine"]',
    title: () => "Refine, if you like",
    text: () => "Keep only some genres or tags, your loved tracks, your top artists, what you play at night, songs you haven't heard in a while… All optional.",
    note: (c) => (c.importing || c.tagging ? ACCURACY : null),
  },
  {
    id: "sort",
    route: EDITOR,
    target: '[data-guide-step="sort"]',
    needs: "sort",
    title: () => "Choose what comes first",
    text: () => "Most played, recently discovered, a fresh shuffle each time… The order decides which tracks make the cut.",
    action: "Choose an order",
  },
  {
    id: "size",
    route: EDITOR,
    target: '[data-guide-step="size"]',
    needs: "size",
    title: () => "How long a playlist?",
    text: () => "Up to 200 tracks. 50 is about three hours of music.",
    action: "Type a size",
  },
  {
    id: "schedule",
    route: EDITOR,
    target: '[data-guide-step="schedule"]',
    needs: "schedule",
    title: () => "When should it run?",
    text: () => "Every Monday morning, once a month, or only when you ask. Each run makes a fresh playlist.",
    action: "Choose when",
  },
  {
    id: "name",
    route: EDITOR,
    target: '[data-guide-step="name"]',
    needs: "name",
    title: () => "Give it a name",
    text: () => "Type your own, or keep the one in grey.",
    action: "Type a name",
  },
  {
    id: "preview",
    route: EDITOR,
    target: '[data-guide-step="preview"]',
    title: () => "Your playlist, if it ran now",
    text: (c) =>
      c.empty
        ? "Not much here yet: your playlists fill up as you listen."
        : `Change anything above and it follows along.${c.partial ? " Your listens for this window are still arriving, so it will keep changing." : ""}`,
  },
  {
    id: "create",
    route: EDITOR,
    target: '[data-guide-step="create"]',
    goes: AUTOMATION,
    title: () => "Make it real",
    text: (c) =>
      c.importing
        ? "Create and run saves your automation. Its first playlist gets made as soon as your listens are in."
        : "Create and run saves your automation and makes its first playlist.",
    action: "Click Create and run",
  },
  {
    id: "welcome",
    route: AUTOMATION,
    target: null,
    last: true,
    title: () => "Welcome home",
    text: () => "Your thread is lit. From now on it keeps watch over your listens, and burns a little brighter each time a playlist is on its way. Wander wherever you like: it'll be right here.",
    note: (c) =>
      `${c.importing ? `Your first playlist gets made as soon as your listens are in${c.left ? `, ${c.left}` : ""}. ` : ""}Your playlists land in Playlists, ready to send to your streaming app. Next time, a recipe gets you there in one click.`,
  },
];

export const EDITOR_START = STEPS.findIndex((step) => step.id === "window");

const matches = (route, pathname) => (typeof route === "string" ? route === pathname : route.test(pathname));
/** Whether the page shown is the one the step lives on. */
export const onRoute = (step, pathname) => matches(step.route, pathname);
/** Whether the user's click took them where the step leads: the guide moves on by itself. */
export const arrived = (step, pathname) => Boolean(step.goes) && matches(step.goes, pathname);
/** Next moves on once the step's field is filled, and never on a step the user ends by their own click. */
export const canGoOn = (step, filled) => !step.goes && (!step.needs || Boolean(filled[step.needs]));

// endedFor: the account that finished or skipped it in this browser, so it never restarts before the server says so.
const IDLE = { on: false, step: 0, filled: {}, automation: null, preview: {}, endedFor: null };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved ? { ...IDLE, ...saved, preview: {} } : IDLE;
  } catch {
    return IDLE; // Storage blocked: the guide just starts over on reload.
  }
}

let state = load();
const listeners = new Set();

export const guide = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    try {
      // What the preview says is the editor's to say again: it is not kept.
      const { on, step, filled, automation, endedFor } = state;
      localStorage.setItem(KEY, JSON.stringify({ on, step, filled, automation, endedFor }));
    } catch {
      // Storage blocked: the step is lost on reload, nothing else.
    }
    listeners.forEach((listener) => listener());
  },
  start() {
    guide.set({ ...IDLE, on: true, endedFor: state.endedFor });
  },
  /** The editor's field was filled: its step can go on. */
  fill(key) {
    if (!state.filled[key]) guide.set({ filled: { ...state.filled, [key]: true } });
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useGuide = () => useSyncExternalStore(guide.subscribe, guide.get);

/** The editor runs in guide mode while the guide is on one of its steps: blank fields, filled one by one. */
export const guidesEditor = (g) => g.on && STEPS[g.step]?.route === EDITOR;
