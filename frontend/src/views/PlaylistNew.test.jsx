// @vitest-environment jsdom
import React, { act } from "react";
// Custom createRoot rendering (no testing library): tell React act() is supported.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaylistNew from "@/views/PlaylistNew";
import { createAutomation, getAutomation, previewAutomation, updateAutomation } from "@/lib/api";
import { EDITOR_START, guide } from "@/lib/guide";

vi.mock("@/lib/api", () => ({
  previewAutomation: vi.fn(),
  createAutomation: vi.fn(async () => ({ id: "a1" })),
  getKnownTags: vi.fn(async () => []),
  getAutomation: vi.fn(),
  updateAutomation: vi.fn(async () => ({ id: "a1" })),
}));
const auth = vi.hoisted(() => ({ user: { lastfm_username: "u" } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => auth }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (original) => ({ ...(await original()), useNavigate: () => navigate }));

const result = (over = {}) => ({
  tracks: [{ title: "Song", artist: "Band", playcount: 9 }],
  total: 1,
  before_filter: 800,
  after_filter: 60,
  window_artists: 10,
  known_tag_artists: 10,
  ...over,
});

let mounted;

async function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <MemoryRouter>
        <PlaylistNew />
      </MemoryRouter>,
    );
  });
  return container;
}

const wait = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));
const button = (container, label) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const click = (el) => act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const type = (input, value) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
  vi.useFakeTimers();
  vi.clearAllMocks();
  auth.user = { lastfm_username: "u" };
  previewAutomation.mockImplementation(async () => result());
});

afterEach(async () => {
  await act(async () => mounted.root.unmount());
  mounted.container.remove();
  vi.useRealTimers();
});

describe("creator", () => {
  it("previews the default recipe by itself, and each stage shows its count", async () => {
    const container = await render();
    expect(previewAutomation).not.toHaveBeenCalled();
    await wait(400);
    expect(previewAutomation).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("800");
    expect(container.textContent).toContain("60");
    expect(container.textContent).toContain("Song");
    expect(container.querySelector("[data-chain]").dataset.chain).toBe("800,60,1");
  });

  it("opens a previewed track on its Last.fm page, in a new tab", async () => {
    previewAutomation.mockImplementation(async () => result({ tracks: [{ title: "AC/DC? Song", artist: "Sigur Rós", playcount: 9 }] }));
    const container = await render();
    await wait(400);
    const link = container.querySelector("ol li a");
    expect(link.getAttribute("href")).toBe("https://www.last.fm/music/Sigur+R%C3%B3s/_/AC%2FDC%3F+Song");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("says what a preset does, and undoes it over the user's own settings", async () => {
    const container = await render();
    await wait(400);
    expect(container.textContent).toContain("What you played most over the last 3 months.");
    await click(button(container, "Recent"));
    expect(container.textContent).not.toContain("replaced your settings");

    await type(container.querySelector('[aria-label="Playlist size"]'), "12");
    await click(button(container, "Seasonal"));
    expect(container.textContent).toContain("Seasonal replaced your settings.");
    await click(button(container, "Undo"));
    expect(container.querySelector('[aria-label="Playlist size"]').value).toBe("12");
    expect(button(container, "Undo")).toBeUndefined();

    await click(button(container, "Seasonal"));
    await type(container.querySelector('[aria-label="Playlist size"]'), "13");
    expect(button(container, "Undo")).toBeUndefined();
  });

  it("marks a slow preview as busy, and names the plays column", async () => {
    const container = await render();
    await wait(400);
    expect(container.textContent).toContain("Plays");
    expect(container.querySelector("ol").getAttribute("aria-busy")).toBe("false");
    await click(button(container, "Recent"));
    expect(container.querySelector("ol").getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("ol").className).toContain("preview-stale");
    await wait(400);
    expect(container.querySelector("ol").className).not.toContain("preview-stale");
  });

  it("offers counting plays at the moment only with a moment rule and a sort on plays", async () => {
    Element.prototype.scrollIntoView = () => {};
    const container = await render();
    expect(container.querySelector('[aria-label="Count plays"]')).toBeNull();
    await click(button(container, "Add rule"));
    await click(container.querySelector('[aria-label="Filter field"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "Listening moment"));
    await click(container.querySelector('[aria-label="Count plays"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "Count plays at the listening moment"));
    await wait(400);
    expect(previewAutomation.mock.lastCall[0].sortCounts).toBe("moment");
    await click(button(container, "Recent"));
    await wait(400);
    expect(previewAutomation.mock.lastCall[0].sortCounts).toBe("window");
  });

  it("closes a custom schedule when a preset replaces it", async () => {
    Element.prototype.scrollIntoView = () => {};
    const container = await render();
    await click(container.querySelector('[aria-label="How often"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "Custom"));
    expect(container.querySelector('[aria-label="Cron expression"]')).not.toBeNull();
    await click(button(container, "Seasonal"));
    expect(container.querySelector('[aria-label="Cron expression"]')).toBeNull();
    expect(container.querySelector('[aria-label="How often"]').textContent).toContain("Every season");
  });

  it("sends the description", async () => {
    const container = await render();
    await type(container.querySelector('[aria-label="Description"]'), "For the road");
    await click(button(container, "Create only"));
    expect(createAutomation.mock.lastCall[0].description).toBe("For the road");
  });

  it("asks when a custom window ends only if it isn't now", async () => {
    Element.prototype.scrollIntoView = () => {};
    const container = await render();
    await wait(400);
    await click(container.querySelector('[aria-label="Window"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "Custom"));
    expect(container.querySelector('[aria-label="Window end, how long ago"]')).toBeNull();
    expect(container.textContent).not.toContain("ago");
    await click(container.querySelector('[aria-label="Window end"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "earlier"));
    await wait(400);
    expect(previewAutomation.mock.lastCall[0].window.ago).toEqual({ amount: 1, unit: "year" });
  });

  it("waits for a pause: a burst of changes makes one request", async () => {
    const container = await render();
    await wait(400);
    previewAutomation.mockClear();
    await click(button(container, "Recent"));
    await wait(200);
    await click(button(container, "Loved"));
    await wait(399);
    expect(previewAutomation).not.toHaveBeenCalled();
    await wait(1);
    expect(previewAutomation).toHaveBeenCalledTimes(1);
    expect(previewAutomation.mock.calls[0][0].filterGroups[0].conditions[0]).toMatchObject({ field: "userloved", value: true });
  });

  it("never runs two previews at once, and ends on the latest settings", async () => {
    let finish;
    previewAutomation.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(result({ total: 1 })); }));
    const container = await render();
    await wait(400);
    await click(button(container, "Recent"));
    await wait(400);
    expect(previewAutomation).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await wait(0);
    expect(previewAutomation).toHaveBeenCalledTimes(2);
    expect(previewAutomation.mock.calls[1][0].sort).toBe("last_played");
  });

  it("previews the first run of a valid schedule, and never sends a half-typed one", async () => {
    Element.prototype.scrollIntoView = () => {};
    const container = await render();
    await wait(400);
    await click(button(container, "Seasonal"));
    await wait(400);
    expect(previewAutomation.mock.lastCall[0].cron).toBe("0 0 1 3,6,9,12 *");

    await click(container.querySelector('[aria-label="How often"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "Custom"));
    await type(container.querySelector('[aria-label="Cron expression"]'), "0 0");
    await wait(400);
    expect(previewAutomation.mock.lastCall[0].cron).toBe("");
  });

  it("keeps the last result and says so when a preview fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = await render();
    await wait(400);
    previewAutomation.mockRejectedValueOnce(new Error("boom"));
    await click(button(container, "Recent"));
    await wait(400);
    expect(container.querySelector('[role="alert"]').textContent).toContain("could not update");
    expect(container.textContent).not.toContain("boom");
    expect(container.textContent).toContain("Song");
    error.mockRestore();
  });

  it("creates under the suggested name, then under a typed one", async () => {
    const container = await render();
    await click(button(container, "Create only"));
    expect(createAutomation.mock.calls[0][0]).toMatchObject({ name: "Top tracks", cron: "", sort: "most_played" });
    expect(navigate).toHaveBeenCalledWith("/automations/a1", { state: { notice: "Created. Nothing runs until you start it.", runNow: false } });

    await type(container.querySelector('[aria-label="Name"]'), "Mine");
    await click(button(container, "Seasonal"));
    await click(button(container, "Create only"));
    expect(createAutomation.mock.calls[1][0]).toMatchObject({ name: "Mine", cron: "0 0 1 3,6,9,12 *", output: { maxSize: 30 } });
  });

  it("says what each button does: with a schedule, which period now and which date next", async () => {
    previewAutomation.mockImplementation(async (draft) => result(draft.cron ? { period: { start: "2026-06-01", end: "2026-08-31" }, next_run: "2026-12-01" } : {}));
    const container = await render();
    await wait(400);
    expect(container.textContent).toContain("Nothing runs until you start it.");
    expect(container.textContent).not.toContain("Covers");
    await click(button(container, "Create and run"));
    expect(navigate).toHaveBeenCalledWith("/automations/a1", { state: { notice: "Created.", runNow: true } });

    await click(button(container, "Seasonal"));
    expect(container.textContent).toContain("Create and run makes the last full period now. Create only starts on the next date.");
    await wait(400);
    expect(container.textContent).toContain("Covers Jun 1 to Aug 31, 2026.");
    expect(container.textContent).toContain("Create and run makes Jun 1 to Aug 31, 2026 now. Create only starts on Dec 1, 2026.");
    await click(button(container, "Create only"));
    expect(navigate).toHaveBeenLastCalledWith("/automations/a1", { state: { notice: "Created. First playlist on Dec 1, 2026.", runNow: false } });
  });

  it("blocks creating on a malformed schedule and says where to look", async () => {
    Element.prototype.scrollIntoView = () => {};
    const container = await render();
    await click(container.querySelector('[aria-label="How often"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "Custom"));
    await type(container.querySelector('[aria-label="Cron expression"]'), "0 0");
    expect(container.textContent).toContain("Use five parts");
    expect(container.textContent).toContain("Fix the schedule");
    expect(button(container, "Create and run").disabled).toBe(true);
    expect(button(container, "Create only").disabled).toBe(true);
  });

  it("offers every preview row on a phone from one button", async () => {
    const tracks = Array.from({ length: 9 }, (_, i) => ({ title: `Song ${i}`, artist: "Band", playcount: 1 }));
    previewAutomation.mockImplementation(async () => result({ tracks, total: 9 }));
    const container = await render();
    await wait(400);
    expect(container.querySelector("ol").className).toContain("nth-child(n+9)");
    await click(button(container, "Show all 9"));
    expect(container.querySelector("ol").className).not.toContain("nth-child");
    expect(button(container, "Show all 9")).toBeUndefined();
  });

  it("counts a rule without a value as not applied", async () => {
    const container = await render();
    await click(button(container, "Add rule"));
    expect(container.textContent).toContain("No rules, 1 not applied yet");
    expect(container.textContent).toContain("Not applied until it has a value.");
  });

  it("shows why creating failed and stays on the page", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = await render();
    createAutomation.mockRejectedValueOnce(new Error("API 422: Invalid cron expression: bad minute"));
    await click(button(container, "Create only"));
    expect(container.querySelector('[role="alert"]').textContent).toBe("That schedule isn't valid. Check each part: minute hour day month weekday.");
    createAutomation.mockRejectedValueOnce(new Error("API 500: Server down"));
    await click(button(container, "Create only"));
    expect(container.querySelector('[role="alert"]').textContent).toBe("Server down");
    expect(navigate).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("says so honestly when the result is short, empty or missing tags", async () => {
    previewAutomation.mockResolvedValueOnce(result({ known_tag_artists: 4 }));
    const container = await render();
    await wait(400);
    expect(container.textContent).toContain("Only 1 of the 50");

    previewAutomation.mockResolvedValueOnce(result({ tracks: [], total: 0, after_filter: 0 }));
    await click(button(container, "Recent"));
    await wait(400);
    expect(container.textContent).toContain("No track fits");
    expect(container.querySelector("[data-chain]").dataset.chain).toBe("800,0,0");
  });

  it("sends a custom window and shows its fields", async () => {
    const container = await render();
    await wait(400);
    Element.prototype.scrollIntoView = () => {};
    await click(container.querySelector('[aria-label="Window"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "Custom"));
    await type(container.querySelector('[aria-label="Window length"]'), "9");
    await wait(400);
    expect(previewAutomation.mock.lastCall[0].window).toEqual({ length: { amount: 9, unit: "week" }, ago: null });
  });

  it("asks to link Last.fm rather than preview without an account", async () => {
    auth.user = {};
    const container = await render();
    await wait(400);
    expect(previewAutomation).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Link your Last.fm account");
    expect(button(container, "Create and run").disabled).toBe(true);
  });
});

describe("editing an automation", () => {
  const SAVED = {
    id: "a1",
    user_id: "u1",
    name: "My mix",
    description: null,
    window: { length: { amount: 3, unit: "month" }, ago: null },
    sort: "most_played",
    cron: null,
    filterGroups: [],
    output: { maxSize: 25, noRepeatPlaylists: 2 },
    enabled: true,
  };

  async function renderEdit() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { container, root };
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/automations/a1/edit"]}>
          <Routes>
            <Route path="/automations/:id/edit" element={<PlaylistNew />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    return container;
  }

  it("starts from the stored settings and previews as that automation", async () => {
    getAutomation.mockResolvedValue(SAVED);
    const container = await renderEdit();
    expect(container.querySelector("h1").textContent).toBe("Edit automation");
    expect(container.querySelector('input[aria-label="Name"]').value).toBe("My mix");
    expect(container.querySelector('input[aria-label="Playlist size"]').value).toBe("25");
    await wait(500);
    expect(previewAutomation.mock.calls.at(-1)[2]).toBe("a1");
    expect(container.textContent).not.toContain("Repeats can only be skipped");
    expect(container.textContent).toContain("Nothing runs until you start it.");
  });

  it("saves in place instead of creating, then goes back to the automation", async () => {
    getAutomation.mockResolvedValue(SAVED);
    const container = await renderEdit();
    await type(container.querySelector('input[aria-label="Name"]'), "Renamed");
    await click(button(container, "Save"));
    expect(createAutomation).not.toHaveBeenCalled();
    expect(updateAutomation.mock.calls[0][0]).toBe("a1");
    expect(updateAutomation.mock.calls[0][1].name).toBe("Renamed");
    expect(updateAutomation.mock.calls[0][1].output.maxSize).toBe(25);
    expect(navigate).toHaveBeenLastCalledWith("/automations/a1", { state: { notice: "Saved.", runNow: false } });
  });

  it("can save and run, and says why a save failed", async () => {
    getAutomation.mockResolvedValue(SAVED);
    const container = await renderEdit();
    await click(button(container, "Save and run"));
    expect(navigate).toHaveBeenLastCalledWith("/automations/a1", { state: { notice: "Saved.", runNow: true } });

    updateAutomation.mockRejectedValueOnce(new Error("API 500: nope"));
    await click(button(container, "Save"));
    expect(container.querySelector('[role="alert"]').textContent).toBe("nope");
  });

  it("says when the automation is gone, and retries a failed load", async () => {
    getAutomation.mockRejectedValueOnce(new Error("API 404: gone"));
    let container = await renderEdit();
    expect(container.textContent).toContain("This automation no longer exists");
    await act(async () => mounted.root.unmount());
    container.remove();

    getAutomation.mockRejectedValueOnce(new Error("API 500: boom"));
    getAutomation.mockResolvedValue(SAVED);
    container = await renderEdit();
    expect(container.textContent).toContain("This automation could not load.");
    await click(button(container, "Try again"));
    expect(container.querySelector("h1").textContent).toBe("Edit automation");
  });
});


describe("during a first import", () => {
  it("says how far back the listens are read, when the window reaches past it", async () => {
    previewAutomation.mockImplementation(async () => result({ history_partial: true, history_read_from: "2024-03-15T12:00:00Z" }));
    const container = await render();
    await wait(400);
    expect(container.textContent).toContain("Your listens are read back to March 2024 so far: this preview will change as the rest comes in.");
  });
});

describe("in the newcomer's guide", () => {
  afterEach(() => guide.set({ on: false, step: 0, filled: {} }));

  it("starts blank, leaves the recipes out, and previews once a window is picked", async () => {
    guide.set({ on: true, step: EDITOR_START + 3, filled: { window: true } });
    const container = await render();
    // Opened again: its part of the guide starts over with the fields.
    expect(guide.get()).toMatchObject({ step: EDITOR_START, filled: {} });
    await wait(400);
    expect(previewAutomation).not.toHaveBeenCalled();
    for (const blank of ["Choose a window", "Choose an order", "Choose when"]) expect(container.textContent).toContain(blank);
    expect(container.querySelector('input[aria-label="Playlist size"]').value).toBe("");
    expect(container.querySelector('input[aria-label="Name"]').value).toBe("");
    expect(container.querySelector("[aria-pressed]").parentElement.className).toContain("hidden");
    await act(async () => guide.fill("window"));
    await wait(400);
    expect(previewAutomation).toHaveBeenCalledTimes(1);
  });

  it("tells the guide its field is filled", async () => {
    guide.set({ on: true, step: EDITOR_START, filled: {} });
    const container = await render();
    await type(container.querySelector('input[aria-label="Playlist size"]'), "40");
    await type(container.querySelector('input[aria-label="Name"]'), "Mine");
    expect(guide.get().filled).toEqual({ size: true, name: true });
  });
});
