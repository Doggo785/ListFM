// @vitest-environment jsdom
import React, { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import BackgroundTasks from "@/components/elements/BackgroundTasks";
import { getScrobbleSync, startScrobbleSync } from "@/lib/api";

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
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("BackgroundTasks", () => {
  it("shows the first load progress and polls until it completes", async () => {
    vi.useFakeTimers();
    startScrobbleSync.mockResolvedValue({ stage: "sync", done: 38, total: 153, complete: false });
    getScrobbleSync.mockResolvedValue({ stage: "done", done: 153, total: 153, complete: true });
    await render();
    expect(container.textContent).toContain("Loading your listening history: 25%");
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(getScrobbleSync).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("");
  });

  it("shows a failed load and only re-reads it when idle", async () => {
    vi.useFakeTimers();
    const failed = { stage: "error", error: "Sync failed.", done: 0, total: 0, complete: false };
    startScrobbleSync.mockResolvedValue(failed);
    getScrobbleSync.mockResolvedValue(failed);
    await render();
    expect(container.textContent).toBe("Sync failed.");
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(getScrobbleSync).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(57000));
    expect(getScrobbleSync).toHaveBeenCalledTimes(1);
  });

  it("shows a long tag pass, and picks up one started by a later sync", async () => {
    vi.useFakeTimers();
    startScrobbleSync.mockResolvedValue({ stage: "done", complete: true, tags_done: 0, tags_total: 0 });
    getScrobbleSync.mockResolvedValue({ stage: "done", complete: true, tags_done: 1200, tags_total: 9552 });
    await render();
    expect(container.textContent).toBe("");
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(container.textContent).toContain("Looking up tags: 1,200 / 9,552 artists");
    expect(container.textContent).toContain("Tag filters can be incomplete until then.");
    expect(container.querySelector('[role="status"]').textContent).not.toContain("1,200");
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
