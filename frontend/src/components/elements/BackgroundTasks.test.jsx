// @vitest-environment jsdom
import React, { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import BackgroundTasks from "@/components/elements/BackgroundTasks";
import { getScrobbleSync, startScrobbleSync } from "@/lib/api";
import { ribbonStage } from "@/lib/pixelRibbon";

vi.mock("@/lib/api", () => ({ startScrobbleSync: vi.fn(), getScrobbleSync: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { lastfm_username: "me" } }) }));

let root;
let container;

async function render() {
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<BackgroundTasks />));
}

afterEach(async () => {
  await act(async () => root.unmount());
  expect(ribbonStage.work).toBeNull(); // Unmounted, it takes its work off the ribbon.
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("BackgroundTasks", () => {
  it("shows the first load progress and polls until it completes", async () => {
    vi.useFakeTimers();
    startScrobbleSync.mockResolvedValue({
      stage: "sync", done: 38, total: 153, complete: false, eta_seconds: 370,
      since: "2019-02-01T10:00:00Z", until: "2023-03-14T09:00:00Z",
    });
    getScrobbleSync.mockResolvedValue({ stage: "done", done: 153, total: 153, complete: true });
    await render();
    expect(container.textContent).toContain("Importing your listens up to March 2023: 25% · about 6 min left.");
    expect(ribbonStage.work).toMatchObject({ kind: "listens", share: 38 / 153, since: Date.parse("2019-02-01T10:00:00Z"), doneAt: null });
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(getScrobbleSync).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("");
    // Finished: the ribbon keeps its front a moment, for the last flare.
    expect(ribbonStage.work.doneAt).not.toBeNull();
  });

  it("says it is estimating before the first page is in", async () => {
    startScrobbleSync.mockResolvedValue({ stage: "sync", done: 0, total: 153, complete: false, eta_seconds: null });
    await render();
    expect(container.textContent).toContain("Importing your listens: 0% · estimating the time left.");
  });

  it("shows a failed load and only re-reads it when idle", async () => {
    vi.useFakeTimers();
    const failed = { stage: "error", error: "Sync failed.", done: 0, total: 0, complete: false };
    startScrobbleSync.mockResolvedValue(failed);
    getScrobbleSync.mockResolvedValue(failed);
    await render();
    expect(container.textContent).toBe("Sync failed.");
    expect(ribbonStage.work).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(getScrobbleSync).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(57000));
    expect(getScrobbleSync).toHaveBeenCalledTimes(1);
  });

  it("shows a long tag pass, and picks up one started by a later sync", async () => {
    vi.useFakeTimers();
    startScrobbleSync.mockResolvedValue({ stage: "done", complete: true, tags_done: 0, tags_total: 0 });
    getScrobbleSync.mockResolvedValue({ stage: "done", complete: true, tags_done: 1200, tags_total: 9552, tags_eta_seconds: 190 });
    await render();
    expect(container.textContent).toBe("");
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(container.textContent).toContain("Looking up tags: 1,200 / 9,552 artists · about 3 min left");
    expect(ribbonStage.work).toMatchObject({ kind: "tags", until: null });
    expect(container.textContent).toContain("Tag filters can be incomplete until then.");
    expect(container.querySelector('[role="status"]').textContent).not.toContain("1,200");
  });

  it("shows a run at work, scheduled or not, with its stage, and wakes up for the next one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    startScrobbleSync.mockResolvedValue({ stage: "done", complete: true, tags_total: 0, runs: [], next_run_at: "2026-11-10T12:00:20Z" });
    getScrobbleSync.mockResolvedValue({
      stage: "done", complete: true, tags_total: 0,
      runs: [{ automation_id: "a", name: "Monthly", stage: "filter", done: 40, total: 900 }],
    });
    await render();
    expect(container.textContent).toBe("");
    // Not a minute later: at the run's time.
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(getScrobbleSync).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Running “Monthly”: filtering the tracks.");
    expect(ribbonStage.work).toMatchObject({ kind: "run", share: 0.85 });
    // It ends: the pages showing runs and playlists are told.
    const ended = vi.fn();
    window.addEventListener("listfm:runs-done", ended);
    getScrobbleSync.mockResolvedValue({ stage: "done", complete: true, tags_total: 0, runs: [] });
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(ended).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("");
    window.removeEventListener("listfm:runs-done", ended);
  });

  it("names several runs at once", async () => {
    startScrobbleSync.mockResolvedValue({
      stage: "done", complete: true, tags_total: 0,
      runs: [{ name: "A", stage: "source" }, { name: "B", stage: "sync" }],
    });
    await render();
    expect(container.textContent).toContain("Running “A” and “B”. Their playlists show up in Playlists when they are done.");
  });

  it("says a run's playlist is ready while it delivers", async () => {
    startScrobbleSync.mockResolvedValue({ stage: "done", complete: true, tags_total: 0, runs: [{ name: "A", stage: "done" }] });
    await render();
    expect(container.textContent).toContain("Running “A”: delivering. Its playlist is ready in Playlists.");
  });

  it("stays silent during a routine sync and a small tag pass", async () => {
    startScrobbleSync.mockResolvedValue({ stage: "sync", done: 1, total: 2, complete: true, tags_done: 3, tags_total: 12 });
    await render();
    expect(container.textContent).toBe("");
  });

  it("stays hidden when the status cannot be read", async () => {
    startScrobbleSync.mockRejectedValue(new Error("API 400"));
    await render();
    expect(container.textContent).toBe("");
  });
});
