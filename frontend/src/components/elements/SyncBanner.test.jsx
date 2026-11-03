// @vitest-environment jsdom
import React, { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SyncBanner from "@/components/elements/SyncBanner";
import { getScrobbleSync, startScrobbleSync } from "@/lib/api";

vi.mock("@/lib/api", () => ({ startScrobbleSync: vi.fn(), getScrobbleSync: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { lastfm_username: "me" } }) }));

let root;
let container;

async function render() {
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(<SyncBanner />));
}

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SyncBanner", () => {
  it("shows the first load progress and polls until it completes", async () => {
    vi.useFakeTimers();
    startScrobbleSync.mockResolvedValue({ stage: "sync", done: 38, total: 153, complete: false });
    getScrobbleSync.mockResolvedValue({ stage: "done", done: 153, total: 153, complete: true });
    await render();
    expect(container.textContent).toContain("Loading your listening history… 25%");
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(getScrobbleSync).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("");
  });

  it("shows a failed load and stops polling", async () => {
    startScrobbleSync.mockResolvedValue({ stage: "error", error: "Sync failed.", done: 0, total: 0, complete: false });
    await render();
    expect(container.textContent).toBe("Sync failed.");
    expect(getScrobbleSync).not.toHaveBeenCalled();
  });

  it("stays hidden when the status cannot be read", async () => {
    startScrobbleSync.mockRejectedValue(new Error("API 400"));
    await render();
    expect(container.textContent).toBe("");
  });
});
