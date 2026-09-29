// @vitest-environment jsdom
import React, { act } from "react";
// Custom createRoot rendering (no testing library): tell React act() is supported.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/contexts/AuthContext";
import {
  cancelPreview,
  getAutomation,
  getAutomationHistory,
  getPreviewProgress,
  getRunProgress,
  pollProgress,
  previewAutomation,
  runAutomationNow,
} from "@/lib/api";
import PlaylistDetail from "@/views/PlaylistDetail";

vi.mock("@/lib/api", () => ({
  request: vi.fn(async () => ({ lastfm_username: "tester" })),
  setCurrentUsername: vi.fn(),
  getAutomation: vi.fn(),
  updateAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
  previewAutomation: vi.fn(),
  getAutomationHistory: vi.fn(),
  runAutomationNow: vi.fn(),
  getGeneratedPlaylistTracks: vi.fn(),
  newProgressToken: vi.fn(() => "test-token"),
  getPreviewProgress: vi.fn(),
  cancelPreview: vi.fn(),
  getRunProgress: vi.fn(),
  pollProgress: vi.fn(),
}));

// jsdom has no IntersectionObserver (used by motion); a no-op stub is enough
// since the tests only assert rendered text, not animations.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

const AUTOMATION = {
  id: "a1",
  name: "Test automation",
  description: "",
  source: { type: "recent_tracks", period: "3m" },
  cron: "0 8 * * *",
  filterGroups: [],
};

async function renderDetail() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/playlists/a1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/playlists/:id" element={<PlaylistDetail />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  });
  return { container, root };
}

async function waitForText(container, text) {
  for (let i = 0; i < 100; i++) {
    if (container.textContent.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Timed out waiting for: ${text}`);
}

function clickButton(container, text) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent.includes(text)
  );
  expect(button).toBeDefined();
  return act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function teardown(container, root) {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
}

describe("PlaylistDetail progress", () => {
  it("shows a done summary after Run now", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          id: "h1",
          status: "completed",
          scheduled_for: new Date().toISOString(),
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          attempt: 1,
          tracks_before_filter: 10,
          tracks_after_filter: 3,
          generated_playlist_id: null,
          error_message: null,
        },
      ]);
    runAutomationNow.mockResolvedValue({ id: "h1", status: "completed" });
    getRunProgress.mockResolvedValue({ stage: "enrich", done: 3, total: 10 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Run now");
      await clickButton(container, "Run now");
      await waitForText(container, "Done");
      expect(container.textContent).toContain("3 of 10 tracks");
      expect(runAutomationNow).toHaveBeenCalledWith("a1", "test-token");
      expect(getRunProgress).toHaveBeenCalledWith("a1", "test-token");
      const entry = container.querySelector('div[role="button"]');
      expect(entry).not.toBeNull();
      await act(async () => {
        entry.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await waitForText(container, "Finished");
    } finally {
      await teardown(container, root);
    }
  });

  it("shows a done summary after preview Load", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    const tracks = [1, 2, 3, 4].map((i) => ({ title: `Song ${i}`, artist: "Artist" }));
    previewAutomation.mockResolvedValue({
      tracks,
      total: 4,
      before_filter: 4,
      cancelled: false,
    });
    getPreviewProgress.mockResolvedValue({ stage: "enrich", done: 2, total: 4 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Load");
      await clickButton(container, "Load");
      await waitForText(container, "Done");
      expect(container.textContent).toContain("4 of 4 tracks");
    } finally {
      await teardown(container, root);
    }
  });

  it("cancelling a preview shows the cancelled note", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    getPreviewProgress.mockReturnValue(new Promise(() => {}));
    previewAutomation.mockReturnValue(new Promise(() => {}));
    cancelPreview.mockResolvedValue(null);
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Load");
      await clickButton(container, "Load");
      await waitForText(container, "Starting");
      await clickButton(container, "Cancel");
      await waitForText(container, "Cancelled");
      expect(cancelPreview).toHaveBeenCalledWith("test-token");
    } finally {
      await teardown(container, root);
    }
  });

  it("shows an error when Run now fails", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    runAutomationNow.mockRejectedValue(new Error("API 409: Automation already running"));
    getRunProgress.mockResolvedValue({ stage: "enrich", done: 1, total: 5 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Run now");
      await clickButton(container, "Run now");
      await waitForText(container, "API 409: Automation already running");
    } finally {
      await teardown(container, root);
    }
  });

  it("shows an error when preview Load fails", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    previewAutomation.mockRejectedValue(new Error("API 502: Unable to fetch tracks"));
    getPreviewProgress.mockResolvedValue({ stage: "enrich", done: 1, total: 5 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Load");
      await clickButton(container, "Load");
      await waitForText(container, "API 502: Unable to fetch tracks");
    } finally {
      await teardown(container, root);
    }
  });

  it("shows the cancelled note when the server aborts the preview", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    previewAutomation.mockResolvedValue({ cancelled: true });
    getPreviewProgress.mockResolvedValue({ stage: "done", done: 0, total: 0 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Load");
      await clickButton(container, "Load");
      await waitForText(container, "Cancelled");
    } finally {
      await teardown(container, root);
    }
  });

  it("shows tracking errors when progress polling fails", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    runAutomationNow.mockReturnValue(new Promise(() => {}));
    getRunProgress.mockRejectedValue("gone");
    previewAutomation.mockReturnValue(new Promise(() => {}));
    getPreviewProgress.mockRejectedValue("gone");
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Run now");
      await clickButton(container, "Run now");
      await waitForText(container, "Failed to track run progress");
      await clickButton(container, "Load");
      await waitForText(container, "Failed to track preview progress");
    } finally {
      await teardown(container, root);
    }
  });

  it("keeps the cancelled note even if the server call fails", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    getPreviewProgress.mockReturnValue(new Promise(() => {}));
    previewAutomation.mockReturnValue(new Promise(() => {}));
    cancelPreview.mockRejectedValue(new Error("gone"));
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Load");
      await clickButton(container, "Load");
      await waitForText(container, "Starting");
      await clickButton(container, "Cancel");
      await waitForText(container, "Cancelled");
    } finally {
      await teardown(container, root);
    }
  });
});
