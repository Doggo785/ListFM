// @vitest-environment jsdom
import React, { act } from "react";
// Custom createRoot rendering (no testing library): tell React act() is supported.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/contexts/AuthContext";
import Dashboard from "@/views/Dashboard";

vi.mock("@/lib/api", () => ({
  request: vi.fn(async () => ({ lastfm_username: "tester" })),
  setCurrentUsername: vi.fn(),
  getAutomations: vi.fn(async () => []),
  getUserInfo: vi.fn(async () => ({ image: null })),
  getRecentTracks: vi.fn(async () => ({
    tracks: [
      { title: "Song A", artist: "Artist X", album: "Album 1" },
      { title: "Song B", artist: "Artist X", album: "Album 1" },
      { title: "Song C", artist: "Artist Y", album: "Album 2" },
    ],
  })),
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

describe("Dashboard recent scope note", () => {
  it("says the stats cover only the last 50 plays", async () => {
    const { container, root } = await renderDashboard();
    try {
      expect(container.textContent).toContain("Partial preview");
      expect(container.textContent).toContain("last 50 plays");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
