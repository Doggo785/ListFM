// @vitest-environment jsdom
import React, { act } from "react";
// Custom createRoot rendering (no testing library): tell React act() is supported.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaylistNew from "@/views/PlaylistNew";
import { createAutomation, previewAutomation } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  previewAutomation: vi.fn(),
  createAutomation: vi.fn(async () => ({ id: "a1" })),
  getKnownTags: vi.fn(async () => []),
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
    expect(navigate).toHaveBeenCalledWith("/playlists/a1", { state: { created: "Created. Nothing runs until you start it.", runNow: false } });

    await type(container.querySelector('[aria-label="Name"]'), "Mine");
    await click(button(container, "Seasonal"));
    await click(button(container, "Create automation"));
    expect(createAutomation.mock.calls[1][0]).toMatchObject({ name: "Mine", cron: "0 0 1 3,6,9,12 *", output: { maxSize: 30 } });
  });

  it("says what creating does: a schedule starts by itself, otherwise it offers to run", async () => {
    const container = await render();
    expect(container.textContent).toContain("Nothing runs until you start it.");
    await click(button(container, "Create and run"));
    expect(navigate).toHaveBeenCalledWith("/playlists/a1", { state: { created: "Created.", runNow: true } });

    await click(button(container, "Seasonal"));
    expect(container.textContent).toContain("First playlist in about a minute, from the last full period, then the 1st of March, June, September and December at 00:00.");
    expect(button(container, "Create and run")).toBeUndefined();
    await click(button(container, "Create automation"));
    expect(navigate.mock.lastCall[1].state.runNow).toBe(false);
  });

  it("blocks creating on a malformed schedule and says where to look", async () => {
    Element.prototype.scrollIntoView = () => {};
    const container = await render();
    await click(container.querySelector('[aria-label="How often"]'));
    await click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.trim() === "Custom"));
    await type(container.querySelector('[aria-label="Cron expression"]'), "0 0");
    expect(container.textContent).toContain("Use five parts");
    expect(container.textContent).toContain("Fix the schedule");
    expect(button(container, "Create automation").disabled).toBe(true);
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
