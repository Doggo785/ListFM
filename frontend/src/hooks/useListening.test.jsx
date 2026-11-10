// @vitest-environment jsdom
import React, { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useListening } from "@/hooks/useListening";
import { getLatestRuns, getListeningStory, getListeningTotals } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getListeningStory: vi.fn(), getListeningTotals: vi.fn(), getLatestRuns: vi.fn() }));

let root;

function Probe() {
  useListening("me");
  return null;
}

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useListening", () => {
  it("keeps reading through a long first import, then waits for the art it starts", async () => {
    vi.useFakeTimers();
    getLatestRuns.mockResolvedValue([]);
    getListeningStory.mockResolvedValue({ months: [], covers_pending: true });
    getListeningTotals.mockResolvedValue({ complete: false });
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    // Far more reads than the art allows: the import's own do not count.
    await act(async () => vi.advanceTimersByTimeAsync(30 * 3000));
    expect(getListeningStory).toHaveBeenCalledTimes(31);

    getListeningTotals.mockResolvedValue({ complete: true });
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(getListeningStory).toHaveBeenCalledTimes(33);

    getListeningStory.mockResolvedValue({ months: [], covers_pending: false });
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(getListeningStory).toHaveBeenCalledTimes(34);
  });
});
