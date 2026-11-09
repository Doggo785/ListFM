// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgedNames } from "@/lib/forge";
import demo from "@/lib/landing/demo.json";
import { storyBeats, storyScreens } from "@/lib/landing/story";
import Landing from "./Landing";

const hook = vi.hoisted(() => ({ auth: {}, reduced: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => hook.auth }));
vi.mock("motion/react", () => ({ useReducedMotion: () => hook.reduced }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const VIEW = 800;
const STORY_TOP = VIEW;
const BEATS = storyBeats(demo.runs.length, demo.recipes.length).length;
const STORY_HEIGHT = storyScreens({ length: BEATS }) * VIEW;

function fakeContext() {
  return new Proxy(
    {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      measureText: () => ({ width: 100, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }),
    },
    { get: (target, key) => target[key] ?? (() => {}), set: () => true },
  );
}

describe("Landing", () => {
  let host;
  let root;
  let frames;
  let now;

  const scroller = () => host.querySelector(".landing");
  const flush = async (count = 3, ms = 16) => {
    for (let i = 0; i < count; i += 1) {
      now += ms;
      const due = frames;
      frames = [];
      await act(async () => due.forEach((run) => run(now)));
    }
  };
  const goToBeat = (beat) => goTo(beat / (BEATS - 1));
  /** Through the story, from 0 to 1, as a wheel would, then long enough for the show to play its way there. */
  const goTo = async (share) => {
    scroller().scrollTop = STORY_TOP + share * (STORY_HEIGHT - VIEW);
    await flush(80, 50);
  };
  const show = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<output>dashboard</output>} />
          </Routes>
        </MemoryRouter>,
      );
    });
  };
  const type = async (value) => {
    const input = host.querySelector("#landing-username");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const submit = async () => {
    await act(async () => host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
  };
  const answer = (status, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  };

  beforeEach(() => {
    hook.auth = { isAuthenticated: false, loading: false };
    hook.reduced = false;
    forgedNames.clear();
    frames = [];
    now = 1000;
    vi.stubGlobal("innerHeight", VIEW);
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("requestAnimationFrame", (run) => frames.push(run));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(fakeContext);
    Element.prototype.scrollTo = vi.fn();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
      const top = host?.querySelector(".landing")?.scrollTop ?? 0;
      const place = this.dataset?.show;
      if (place === "story") return { top: STORY_TOP - top, bottom: STORY_TOP + STORY_HEIGHT - top, left: 0, right: 1200, width: 1200, height: STORY_HEIGHT };
      if (place === "pin") return { top: Math.min(0, STORY_TOP + STORY_HEIGHT - VIEW - top), bottom: VIEW, left: 0, right: 1200, width: 1200, height: VIEW };
      if (place === "turn-line" || place === "end-line") return { top: VIEW - 300, bottom: VIEW - 250, left: 0, right: 1200, width: 1200, height: 50 };
      return { top: 100, bottom: 200, left: 100, right: 300, width: 200, height: 100 };
    });
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("promises what it does, with a way in at the top and at the end", async () => {
    await show();
    expect(host.textContent).toContain("Describe a playlist once.");
    expect(host.textContent).toContain("It keeps coming.");
    expect(host.querySelector('nav a[href="/login"]')).toBeTruthy();
    expect(host.querySelectorAll('a[href="/register"]').length).toBeGreaterThanOrEqual(3);
    expect(document.title).toContain("ListFM");
  });

  it("is honest at the end, and links its source", async () => {
    await show();
    expect(host.textContent).toContain("isn't affiliated with Last.fm");
    expect(host.querySelector("footer a").href).toBe("https://github.com/Doggo785/ListFM");
    expect(host.querySelector("footer").textContent).toContain(`${demo.name}'s real history, as of`);
  });

  it("waits for the session, then sends a signed-in person to the Dashboard", async () => {
    hook.auth = { isAuthenticated: false, loading: true };
    await show();
    expect(host.querySelector(".landing")).toBe(null);
    hook.auth = { isAuthenticated: true, loading: false };
    await show();
    expect(host.querySelector("output").textContent).toBe("dashboard");
  });

  it("wakes up on its own, and lights the name after the breath", async () => {
    await show();
    await flush(40);
    expect(host.querySelector(".forged-name--cold")).toBeTruthy();
    await flush(150);
    expect(host.querySelector("canvas.landing__stage")).toBeTruthy();
  });

  it("skips the wake-up for a visitor who scrolls", async () => {
    await show();
    scroller().scrollTop = 100;
    await flush();
    expect(host.textContent).toContain("Describe a playlist once.");
  });

  it("doesn't play the wake-up twice in a page load", async () => {
    forgedNames.add("ListFM");
    await show();
    await flush();
    expect(host.querySelector(".forged-name--cold")).toBe(null);
  });

  it("tells the listens: the years, then the total", async () => {
    await show();
    await goToBeat(1);
    expect(host.textContent).toContain(`followed ${demo.name}'s listening since ${demo.since}`);
    expect(host.textContent).toContain("Last.fm logs what you play across your apps.");
    expect(host.querySelector('[data-show="count"]').textContent).toBe(demo.total.toLocaleString("en-US"));
    expect(host.querySelectorAll("[data-show-cover]").length).toBe(demo.covers.length);
    expect(host.querySelector('a[href="https://github.com/Doggo785"]').textContent).toBe(demo.name);
  });

  it("shows where the story is, and jumps to a scene", async () => {
    await show();
    expect(host.querySelector(".landing__rail")).toBe(null);
    await goToBeat(1);
    const steps = () => [...host.querySelectorAll(".landing__rail button")];
    expect(steps().map((step) => step.getAttribute("aria-current"))).toEqual(["step", null, null, null, null]);
    // At once, and the show with it: no replay of the steps on the way.
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function offsetTop() {
      return this.dataset.show === "story" ? STORY_TOP : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function offsetHeight() {
      return this.dataset.show === "story" ? STORY_HEIGHT : 0;
    });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(VIEW);
    scroller().scrollTo = vi.fn(({ top }) => {
      scroller().scrollTop = top;
    });
    await act(async () => steps()[2].click());
    expect(scroller().scrollTo).toHaveBeenLastCalledWith({ top: expect.any(Number) });
    await flush(2);
    expect(steps().map((step) => step.getAttribute("aria-current"))).toEqual([null, null, "step", null, null]);
  });

  it("leaves the rail behind once the story is over", async () => {
    await show();
    await goTo(1);
    expect(host.querySelector(".landing__rail")).toBeTruthy();
    scroller().scrollTop = STORY_TOP + STORY_HEIGHT - VIEW / 4;
    await flush();
    expect(host.querySelector(".landing__rail")).toBe(null);
  });

  it("waits for a finger to let go before it settles", async () => {
    await show();
    await goToBeat(2);
    await act(async () => scroller().dispatchEvent(new Event("touchstart")));
    const held = STORY_TOP + (2.5 / (BEATS - 1)) * (STORY_HEIGHT - VIEW);
    scroller().scrollTop = held;
    await flush(30, 50);
    expect(scroller().scrollTop).toBe(held);
    await act(async () => window.dispatchEvent(new Event("touchend")));
    await flush(60, 50);
    expect(scroller().scrollTop).toBeCloseTo(STORY_TOP + (3 / (BEATS - 1)) * (STORY_HEIGHT - VIEW), 0);
  });

  it("names the stage its picture shows, arriving from above or below", async () => {
    await show();
    await goToBeat(2);
    await goToBeat(3);
    expect(host.querySelector(".landing__stages").textContent).toContain(`Filters${demo.chain.kept}`);
    expect(host.querySelector(".landing__stages").textContent).toContain("Sort-");
  });

  it("follows the scroll smoothly, then settles on the next step the way it went", async () => {
    await show();
    await goToBeat(1);
    await goToBeat(4);
    expect(host.querySelector(".landing__stages").textContent).toContain("Limit-");
    // A wheel notch, part of the way to the limit: a moment later the page has glided on to it, and the show with it.
    scroller().scrollTop = STORY_TOP + (4.3 / (BEATS - 1)) * (STORY_HEIGHT - VIEW);
    await flush(3, 50);
    expect(host.querySelector(".landing__stages").textContent).toContain("Limit-");
    await flush(60, 50);
    expect(scroller().scrollTop).toBeCloseTo(STORY_TOP + (5 / (BEATS - 1)) * (STORY_HEIGHT - VIEW), 0);
    expect(host.querySelector(".landing__stages").textContent).toContain(`Limit${demo.chain.size}`);
  });

  it("settles back on a step it barely left, going up", async () => {
    await show();
    await goToBeat(1);
    await goToBeat(4);
    scroller().scrollTop = STORY_TOP + (3.7 / (BEATS - 1)) * (STORY_HEIGHT - VIEW);
    await flush(60, 50);
    expect(scroller().scrollTop).toBeCloseTo(STORY_TOP + (3 / (BEATS - 1)) * (STORY_HEIGHT - VIEW), 0);
  });

  it("runs the chain with a counter per stage", async () => {
    await show();
    await goToBeat(2);
    expect(host.textContent).toContain("Tell it what you want");
    expect(host.querySelector('[data-show="marker"]').textContent).toBe(demo.chain.label);
    for (const beat of [3, 4, 5]) await goToBeat(beat);
    const stages = host.querySelector(".landing__stages").textContent;
    expect(stages).toContain(demo.chain.plays.length.toLocaleString("en-US"));
    expect(stages).toContain(String(demo.chain.kept));
    expect(stages).toContain(`Limit${demo.chain.size}`);
    await goToBeat(2);
    expect(host.querySelector(".landing__stages").textContent).toContain("Filters-");
  });

  it("delivers the playlist, with the month it covers", async () => {
    await show();
    await goToBeat(5);
    await goToBeat(6);
    expect(host.textContent).toContain(`${demo.chain.label}, as ${demo.name} lived it. ${demo.chain.size} tracks.`);
    expect(host.textContent).toContain(demo.chain.top[0].title);
  });

  it("keeps going by itself, one run after another", async () => {
    await show();
    await goToBeat(7);
    expect(host.textContent).toContain("Nobody pressed anything.");
    await goToBeat(6 + demo.runs.length);
    expect(host.querySelector(".landing__count").textContent).toContain(demo.runs.at(-1).at);
    expect(host.querySelector(".landing__runs").textContent).toContain(demo.runs.at(-1).period);
    expect(host.querySelectorAll("[data-show-slot]").length).toBe(demo.runs.length);
  });

  it("obeys any recipe, each with its own result", async () => {
    await show();
    await goToBeat(7 + demo.runs.length);
    expect(host.textContent).toContain("Anything you can describe.");
    expect(host.textContent).toContain(demo.recipes[0].name);
    await goToBeat(6 + demo.runs.length + demo.recipes.length);
    expect(host.textContent).toContain(demo.recipes.at(-1).name);
    await goTo(1);
    expect(host.textContent).toContain(demo.recipes.at(-1).sentence);
  });

  it("shows a visitor's own artist and tracks, without an account", async () => {
    answer(200, { artist: "Disiz", month: "November 2025", tracks: [{ artist: "Disiz", title: "melodrama", plays: 1 }] });
    await show();
    await type("doggo");
    await submit();
    expect(fetch.mock.calls[0][0]).toContain("/api/public/listener");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ username: "doggo" });
    expect(host.querySelector(".forged-name").textContent).toContain("ListFM");
    expect([...host.querySelectorAll(".forged-name")].at(-1).textContent).toContain("Disiz");
    expect(host.textContent).toContain("The same month, a year ago: November 2025.");
    expect(host.textContent).toContain("1 play");
    expect(host.textContent).toContain("Real numbers from Last.fm");
    await flush(150);
  });

  it("says when a profile is too recent for a year ago", async () => {
    answer(200, { artist: "Disiz", month: "November 2025", tracks: [] });
    await show();
    await type("newcomer");
    await submit();
    expect(host.textContent).toContain("A year ago, you weren't here yet.");
  });

  it("says when a profile has no listens yet", async () => {
    answer(200, { artist: null, month: "November 2025", tracks: [] });
    await show();
    await type("empty");
    await submit();
    expect(host.textContent).toContain("No listens on this profile yet");
  });

  it("gives the server's words when a name can't be read", async () => {
    answer(404, { detail: "The thread can't find that name." });
    await show();
    await type("nobody");
    await submit();
    expect(host.querySelector('[role="alert"]').textContent).toBe("The thread can't find that name.");
  });

  it("asks nothing for an empty name", async () => {
    answer(200, {});
    await show();
    await submit();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("scrolls to the story on request, and notices the pointer", async () => {
    await show();
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "See how it works").click());
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    await act(async () => scroller().dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 200, clientY: 300 })));
    await flush(60);
    expect(host.querySelector(".landing__stage")).toBeTruthy();
  });

  it("comes in with no show at all under reduced motion, and leaves nothing out", async () => {
    hook.reduced = true;
    await show();
    expect(host.querySelector(".landing__stage")).toBe(null);
    expect(frames).toHaveLength(0);
    for (const words of ["Describe a playlist once.", "This thread has followed", "Tell it what you want", "lived it", "Nobody pressed anything", "Anything you can describe", "Your turn."]) {
      expect(host.textContent).toContain(words);
    }
    for (const recipe of demo.recipes) expect(host.textContent).toContain(recipe.name);
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "See how it works").click());
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });
});
