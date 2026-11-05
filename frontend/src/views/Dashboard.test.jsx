// @vitest-environment jsdom
import React, { act } from "react";
// Custom createRoot rendering (no testing library): tell React act() is supported.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/contexts/AuthContext";
import { getListeningTotals } from "@/lib/api";
import Dashboard from "@/views/Dashboard";

vi.mock("@/lib/api", () => ({
  request: vi.fn(async () => ({ lastfm_username: "tester", image: "https://last.fm/a.png" })),
  setSessionExpiredHandler: vi.fn(),
  getAutomations: vi.fn(async () => []),
  getListeningTotals: vi.fn(async () => ({ listens: 153211, tracks: 41000, artists: 9565, albums: 19154, complete: true })),
  getRecentTracks: vi.fn(async () => ({
    tracks: [
      { title: "Song A", artist: "Artist X", album: "Album 1" },
      { title: "Song B", artist: "Artist X", album: "Album 1" },
      { title: "Song C", artist: "Artist Y", album: "Album 2" },
    ],
  })),
}));

// The real counter animates once in view, which never happens in jsdom.
vi.mock("../components/elements/PixelNumber", () => ({ default: ({ value }) => <span>{value}</span> }));

// jsdom cannot read image pixels; return a fixed palette for the avatar ring.
vi.mock("@/lib/color-extract", async (importOriginal) => ({
  ...(await importOriginal()),
  extractColors: vi.fn(async () => []),
}));

// jsdom has no IntersectionObserver (used by motion); a no-op stub is enough
// since the test only asserts rendered text, not animations.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

async function renderDashboard() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthProvider>
          <Dashboard />
        </AuthProvider>
      </MemoryRouter>
    );
  });
  // Let mocked fetches + state updates flush.
  await act(async () => {});
  return { container, root };
}

describe("Dashboard totals", () => {
  it("shows the stored totals and refreshes them during the first load", async () => {
    vi.useFakeTimers();
    getListeningTotals.mockResolvedValueOnce({ listens: 1000, tracks: 900, artists: 100, albums: 50, complete: false });
    const { container, root } = await renderDashboard();
    try {
      expect(container.textContent).toContain("1000Listens");
      expect(container.textContent).toContain("50Albums");
      expect(container.textContent).toContain("Most played · last 50 plays");
      expect(container.textContent).not.toContain("Partial preview");

      await act(async () => vi.advanceTimersByTimeAsync(3000));
      expect(container.textContent).toContain("153211Listens");

      // Complete: no more polling.
      await act(async () => vi.advanceTimersByTimeAsync(9000));
      expect(getListeningTotals).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      vi.useRealTimers();
    }
  });
});
