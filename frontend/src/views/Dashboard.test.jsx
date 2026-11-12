// @vitest-environment jsdom
import React, { act } from "react";
// Custom createRoot rendering (no testing library): tell React act() is supported.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/contexts/AuthContext";
import { getLatestRuns, getListeningStory, getListeningTotals, getAutomations, getGeneratedPlaylists, request } from "@/lib/api";
import { ribbonStage } from "@/lib/pixelRibbon";
import Dashboard from "@/views/Dashboard";

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", async (importOriginal) => ({ ...(await importOriginal()), useReducedMotion: () => motion.reduced }));
vi.mock("@/lib/api", () => ({
  request: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
  getAutomations: vi.fn(),
  getGeneratedPlaylists: vi.fn(),
  getLatestRuns: vi.fn(),
  getListeningTotals: vi.fn(),
  getListeningStory: vi.fn(),
}));
// The real counter animates once in view, which never happens in jsdom.
vi.mock("@/components/elements/PixelNumber", () => ({ default: ({ value }) => <span>{value}</span> }));

const COVER = "https://lastfm.freetls.fastly.net/i/u/300x300/abc.jpg";
const days = (n) => Array(30).fill(n);
const STORY = {
  moment: {
    artist: "Josman",
    plays: 242,
    days: 30,
    runners_up: ["Rusowsky", "Ninajirachi"],
    albums: [
      { title: "DAISY", artist: "Rusowsky", plays: 127, cover_url: COVER },
      { title: "111", artist: "Milo j", plays: 1, cover_url: null },
    ],
  },
  months: [
    { month: "2026-10", listens: 5000, days: days(9), artist: "Bad Bunny", artist_plays: 300, album: { title: "Un Verano Sin Ti", artist: "Bad Bunny", plays: 300, cover_url: COVER } },
    { month: "2026-11", listens: 872, days: days(4), artist: "Josman", artist_plays: 59, album: null },
  ],
  listens_last_day: 40,
  covers_pending: false,
};
const TOTALS = { listens: 153211, tracks: 41000, artists: 9565, albums: 19154, complete: true };
const AUTOMATION = { id: "a1", name: "Top tracks", sort: "most_played", window: { length: { amount: 2, unit: "day" } }, cron: "", enabled: true, created_at: "2026-11-01T10:00:00Z" };
const PLAYLIST = { id: "p1", automation_id: "a1", generated_at: "2026-11-02T10:00:00Z", track_count: 50, cover_images: [] };
const RUN = { id: "r1", automation_id: "a1", started_at: "2026-11-02T10:00:00Z", status: "success", track_count: 50, final_track_count: 50 };

const stubRect = (rect) => vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 800, bottom: 800, right: 800, ...rect });

let frames;
let username = 0;

async function renderDashboard(user) {
  username += 1;
  request.mockResolvedValue(user === undefined ? { lastfm_username: `tester${username}` } : user);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthProvider>
          <Dashboard />
        </AuthProvider>
      </MemoryRouter>,
    );
  });
  await act(async () => {});
  return { container, root };
}

const runFrames = async (count = 1, step = 16) => {
  await act(async () => {
    for (let i = 0; i < count; i += 1) frames.splice(0).forEach((frame) => frame(performance.now() + i * step));
  });
};

beforeEach(() => {
  motion.reduced = false;
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => frames.push(frame));
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Element.prototype.scrollTo ||= () => {};
  const layer = document.createElement("div");
  layer.id = "under-ribbon";
  document.body.append(layer);
  getListeningStory.mockReset().mockResolvedValue(STORY);
  getListeningTotals.mockReset().mockResolvedValue(TOTALS);
  getLatestRuns.mockReset().mockResolvedValue([RUN]);
  getAutomations.mockReset().mockResolvedValue([AUTOMATION]);
  getGeneratedPlaylists.mockReset().mockResolvedValue([PLAYLIST]);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the poster", () => {
  it("shows who you listen to, their lead, your albums, your latest runs and your totals", async () => {
    const { container, root } = await renderDashboard();
    expect(container.querySelector("h1").textContent).toBe("Josman");
    expect(container.textContent).toContain("Last 30 days: 242 listens, ahead of Rusowsky and Ninajirachi.");
    expect(container.textContent).toContain("DAISY");
    expect(container.textContent).toContain("Rusowsky· 127 listens");
    expect(container.querySelector('a[href="/automations/a1"]').textContent).toContain("Top tracks");
    expect(container.textContent).toContain("Listens153211");
    await act(async () => root.unmount());
  });

  it("asks the shelf for the stored size, which arrives first, and a flying card for the largest", async () => {
    stubRect();
    const { container, root } = await renderDashboard();
    expect(container.querySelector(".poster__album img").getAttribute("src")).toBe(COVER);
    const img = document.querySelector("#under-ribbon .deck-card img");
    expect(img.getAttribute("src")).toBe(COVER.replace("300x300", "770x0"));
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(img.getAttribute("src")).toBe(COVER);
    await act(async () => root.unmount());
  });

  it("uses the ribbon as the cover of an album without art", async () => {
    const { container, root } = await renderDashboard();
    const albums = container.querySelectorAll(".poster__album");
    expect(albums[1].querySelector("img[src*='770x0']")).toBeNull();
    await act(async () => root.unmount());
  });

  it("says when all listens are counted, without a month's frame", async () => {
    getListeningStory.mockResolvedValue({ ...STORY, moment: { ...STORY.moment, days: null, runners_up: [] } });
    const { container, root } = await renderDashboard();
    expect(container.textContent).toContain("All time: 242 listens.");
    await act(async () => root.unmount());
  });

  it("offers a first automation when nothing ran yet", async () => {
    getLatestRuns.mockResolvedValue([]);
    const { container, root } = await renderDashboard();
    expect(container.textContent).toContain("Nothing ran yet.");
    expect(container.querySelector('a[href="/automations/new"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("stands without the runs when they fail", async () => {
    getLatestRuns.mockRejectedValue(new Error("down"));
    const { container, root } = await renderDashboard();
    expect(container.textContent).toContain("Josman");
    expect(container.textContent).not.toContain("Latest runs");
    await act(async () => root.unmount());
  });

  it("carries the name of the account while listens are on their way", async () => {
    getListeningStory.mockResolvedValue({ moment: null, months: [], listens_last_day: 0, covers_pending: false });
    getListeningTotals.mockResolvedValue({ ...TOTALS, complete: false });
    const { container, root } = await renderDashboard();
    expect(container.querySelector("h1").textContent).toBe(`tester${username}`);
    expect(container.textContent).toContain("Your listens are on their way.");
    await act(async () => root.unmount());
  });

  it("says the covers come later instead of showing the ribbon alone during a first import", async () => {
    getListeningStory.mockResolvedValue(STORY);
    getListeningTotals.mockResolvedValue({ ...TOTALS, complete: false });
    const importing = await renderDashboard();
    expect(importing.container.querySelectorAll(".poster__cover-wait")).toHaveLength(1);
    expect(importing.container.textContent).toContain("Covers come after the import");
    await act(async () => importing.root.unmount());

    getListeningTotals.mockResolvedValue(TOTALS);
    const done = await renderDashboard();
    expect(done.container.querySelector(".poster__cover-wait")).toBeNull();
    await act(async () => done.root.unmount());
  });

  it("says when there is nothing to tell yet", async () => {
    getListeningStory.mockResolvedValue({ moment: null, months: [], listens_last_day: 0, covers_pending: false });
    const { container, root } = await renderDashboard();
    expect(container.textContent).toContain("No listens yet.");
    await act(async () => root.unmount());
  });

  it("asks to link Last.fm first", async () => {
    const { container, root } = await renderDashboard({ lastfm_username: null });
    expect(container.querySelector('a[href="/link-lastfm"]')).not.toBeNull();
    expect(getListeningStory).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("offers to try again when the listening fails to load", async () => {
    getListeningStory.mockRejectedValueOnce(new Error("down"));
    const { container, root } = await renderDashboard();
    expect(container.textContent).toContain("Your listening could not load.");
    await act(async () => container.querySelector('[role="alert"] button').click());
    await act(async () => {});
    expect(container.querySelector("h1").textContent).toBe("Josman");
    await act(async () => root.unmount());
  });
});

describe("what grows behind the page", () => {
  it("refreshes the totals during the first load, then stops asking", async () => {
    vi.useFakeTimers();
    getListeningTotals.mockResolvedValueOnce({ ...TOTALS, listens: 1000, complete: false });
    const { container, root } = await renderDashboard();
    expect(container.textContent).toContain("Listens1000");
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(container.textContent).toContain("Listens153211");
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(getListeningTotals).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it("asks again while covers are looked up, but not forever", async () => {
    vi.useFakeTimers();
    getListeningStory.mockResolvedValue({ ...STORY, covers_pending: true });
    const { root } = await renderDashboard();
    await act(async () => vi.advanceTimersByTimeAsync(3000 * 40));
    expect(getListeningStory.mock.calls.length).toBeLessThanOrEqual(20);
    expect(getListeningStory.mock.calls.length).toBeGreaterThan(5);
    await act(async () => root.unmount());
  });

  it("shows what it last read straight away when coming back", async () => {
    const first = await renderDashboard();
    await act(async () => first.root.unmount());
    first.container.remove();
    username -= 1;
    getListeningStory.mockReturnValue(new Promise(() => {}));
    const { container, root } = await renderDashboard();
    expect(container.querySelector("h1").textContent).toBe("Josman");
    await act(async () => root.unmount());
  });
});

describe("the flight", () => {
  it("drives the ribbon and flies the cards under it, newest first", async () => {
    stubRect();
    const { container, root } = await renderDashboard();
    await runFrames();
    expect(ribbonStage.track.zoom).toBe(1);
    expect(ribbonStage.track.focus).toBe(1);
    expect(ribbonStage.embers).toBe(40);
    const cards = document.querySelectorAll("#under-ribbon .deck-card");
    expect(cards).toHaveLength(2);
    expect(cards[1].style.visibility).toBe("visible");
    expect(cards[1].style.transform).toContain("rotateY(0rad)");
    expect(ribbonStage.track.holes.length).toBeGreaterThan(0);
    expect(cards[1].firstElementChild.className).toContain("deck-card__frame--bare");
    expect(cards[0].firstElementChild.className).not.toContain("deck-card__frame--bare");
    expect(container.querySelector(".deck__caption").dataset.far).toBe("0");
    expect(container.querySelector(".deck__caption").textContent).toContain("Nov 2026");
    expect(container.querySelector(".deck__caption").textContent).toContain("59 of 872 listens so far");
    await act(async () => root.unmount());
    expect(ribbonStage.track).toBeNull();
    expect(ribbonStage.beforeDraw).toBeNull();
    expect(document.getElementById("under-ribbon").style.visibility).toBe("hidden");
  });

  it("leaves the cards unasked for until the flight is near", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function far() {
      return { left: 0, top: this.classList.contains("deck") ? 100000 : 0, width: 800, height: 800, bottom: 800, right: 800 };
    });
    const { root } = await renderDashboard();
    await runFrames();
    expect(document.querySelectorAll("#under-ribbon .deck-card")).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it("unrolls a wheel notch over time, and burns the card it takes too far", async () => {
    let deckTop = 0;
    let clock = 100000;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function deckAt() {
      return { left: 0, top: this.classList.contains("deck") ? deckTop : 0, width: 800, height: 800, bottom: 800, right: 800 };
    });
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    getListeningStory.mockResolvedValue({ ...STORY, months: ["2026-09", "2026-10", "2026-11"].map((month) => ({ ...STORY.months[0], month })) });
    const { root } = await renderDashboard();
    await runFrames(2);
    expect(ribbonStage.track.focus).toBe(2);
    expect(document.querySelectorAll("#under-ribbon .deck-card")[0].style.visibility).not.toBe("visible");
    deckTop = -130; // A quarter of the way: halfway between the two newest cards.
    clock += 16;
    await runFrames();
    expect(ribbonStage.track.focus).toBeGreaterThan(1.5);
    expect(ribbonStage.track.focus).toBeLessThan(2);
    clock += 5000;
    await runFrames();
    expect(ribbonStage.track.focus).toBeCloseTo(1.5);
    const { holes } = ribbonStage.track;
    expect(holes).toHaveLength(3);
    expect(holes[0].burn).toBe(0);
    expect(holes[0].away).toBeLessThanOrEqual(holes[1].away);
    expect(holes[2].burn).toBeCloseTo(0.5);
    expect(document.querySelectorAll("#under-ribbon .deck-card")[0].style.visibility).toBe("visible");
    await act(async () => root.unmount());
  });

  it("rewinds from the month you pick", async () => {
    stubRect();
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo").mockImplementation(() => {});
    const { container, root } = await renderDashboard();
    await runFrames();
    const ticks = container.querySelectorAll(".deck__tick");
    expect(ticks[1].getAttribute("aria-current")).toBe("true");
    expect(ticks[0].getAttribute("aria-label")).toBe("Oct 2026: Bad Bunny");
    await act(async () => ticks[0].click());
    expect(scrollTo).toHaveBeenCalledWith({ top: 260, behavior: "smooth" });
    await act(async () => root.unmount());
  });

  it("deals the automations instead of the months", async () => {
    stubRect();
    const { container, root } = await renderDashboard();
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Automations").click());
    await runFrames();
    expect(container.querySelector(".deck__head h2").textContent).toBe("Your automations");
    const caption = container.querySelector(".deck__caption");
    expect(caption.textContent).toContain("Top tracks");
    expect(caption.querySelector('a[href="/automations/a1"]')).not.toBeNull();
    expect(document.querySelectorAll("#under-ribbon .deck-card")).toHaveLength(2);
    expect(container.querySelector('.deck__tick[aria-label="New automation"]')).not.toBeNull();
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Automations").click());
    await act(async () => root.unmount());
  });

  it("scrolls a long list of ticks to the current one", async () => {
    stubRect();
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(400);
    const { container, root } = await renderDashboard();
    await runFrames();
    expect(container.querySelector(".deck__ticks").scrollLeft).toBe(400);
    await act(async () => root.unmount());
  });

  it("keeps the deck for a person with automations but no listens yet", async () => {
    stubRect();
    getListeningStory.mockResolvedValue({ moment: null, months: [], listens_last_day: 0, covers_pending: false });
    const { container, root } = await renderDashboard();
    await runFrames();
    expect(container.querySelector(".deck__head h2").textContent).toBe("Your automations");
    expect(ribbonStage.track.series).toHaveLength(64);
    await act(async () => root.unmount());
  });

  it("lays the months out flat for people who asked for less motion", async () => {
    motion.reduced = true;
    stubRect();
    const { container, root } = await renderDashboard();
    await runFrames();
    expect(container.querySelectorAll(".deck-card--still")).toHaveLength(2);
    expect(document.querySelectorAll("#under-ribbon .deck-card")).toHaveLength(0);
    expect(ribbonStage.track.zoom).toBe(0);
    expect(container.querySelector("h1").className).not.toContain("cold");
    expect(container.querySelector("h1 canvas")).toBeNull();
    await act(async () => root.unmount());
  });

  it("drives from the ribbon's own frames when the ribbon runs", async () => {
    stubRect();
    ribbonStage.alive = true;
    const { root } = await renderDashboard();
    expect(ribbonStage.beforeDraw).toBeTypeOf("function");
    ribbonStage.beforeDraw();
    expect(ribbonStage.track).not.toBeNull();
    await act(async () => root.unmount());
    ribbonStage.alive = false;
  });
});

describe("the forged name", () => {
  const inked = (measureText = () => ({ width: 100, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 })) => {
    const context = {
      font: "",
      measureText,
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    };
    // Anything else a canvas is asked to draw (the album covers') does nothing here.
    const drawing = new Proxy(context, { get: (target, key) => (key in target ? target[key] : () => {}), set: (target, key, value) => Reflect.set(target, key, value) });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(drawing);
    stubRect({ width: 40, height: 40 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
  };
  afterEach(() => {
    delete HTMLElement.prototype.clientWidth;
  });
  const forgeFor = async (seconds) => {
    await act(async () => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        const now = performance.now();
        vi.spyOn(performance, "now").mockReturnValue(now + 1000 / 60);
        frames.splice(0).forEach((frame) => frame(now + 1000 / 60));
      }
    });
  };

  it("starts cold, catches fire, ends in its own colour and leaves no canvas showing", async () => {
    inked();
    const { container, root } = await renderDashboard();
    const name = container.querySelector("h1");
    const fire = name.querySelector("canvas");
    expect(name.className).toContain("forged-name--cold");
    expect(fire.getAttribute("aria-hidden")).toBe("true");
    await forgeFor(8);
    expect(name.className).not.toContain("forged-name--cold");
    expect(fire.style.visibility).toBe("hidden");
    await act(async () => root.unmount());
  });

  it("stays in its colour without a 2D canvas", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container, root } = await renderDashboard();
    expect(container.querySelector("h1").className).not.toContain("forged-name--cold");
    await act(async () => root.unmount());
  });

  it("cuts a name too long for any size, and leaves it out of the fire", async () => {
    let context = null;
    inked(() => ({ width: parseInt(context.font, 10) * 100 }));
    context = HTMLCanvasElement.prototype.getContext();
    const { container, root } = await renderDashboard();
    const name = container.querySelector("h1");
    expect(name.className).toContain("forged-name--cut");
    expect(name.className).not.toContain("forged-name--cold");
    expect(name.querySelector("canvas")).toBeNull();
    await act(async () => root.unmount());
  });

  it("fits a long name by stepping down the sizes that stay on the grid", async () => {
    let context = null;
    inked(() => ({ width: parseInt(context.font, 10) * 10 }));
    context = HTMLCanvasElement.prototype.getContext();
    const { container, root } = await renderDashboard();
    expect(container.querySelector("h1").style.fontSize).toBe("96px");
    await act(async () => root.unmount());
  });
});
