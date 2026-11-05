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
  getScrobbleSync,
  pollProgress,
  previewAutomation,
  runAutomationNow,
  deleteAutomation,
  updateAutomation,
} from "@/lib/api";
import PlaylistDetail from "@/views/PlaylistDetail";

vi.mock("@/lib/api", () => ({
  request: vi.fn(async () => ({ lastfm_username: "tester" })),
  setSessionExpiredHandler: vi.fn(),
  getAutomation: vi.fn(),
  getKnownTags: vi.fn(async () => []),
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
  getScrobbleSync: vi.fn(async () => ({ complete: true })),
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
  window: { length: { amount: 3, unit: "month" }, ago: null },
  sort: "last_played",
  cron: "0 8 * * *",
  filterGroups: [],
};

async function renderDetail(entry = "/playlists/a1") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
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

describe("PlaylistDetail delete", () => {
  const dialog = () => document.querySelector('[role="dialog"]');
  const inDialog = (label) => [...dialog().querySelectorAll("button")].find((b) => b.textContent.trim() === label);
  const press = (button) => act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));

  it("asks first, can back out, then deletes", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    deleteAutomation.mockResolvedValue(undefined);
    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Edit");
      await clickButton(container, "Delete");
      expect(dialog().textContent).toContain("Test automation");
      await press(inDialog("Cancel"));
      expect(dialog()).toBeNull();
      expect(deleteAutomation).not.toHaveBeenCalled();

      await clickButton(container, "Delete");
      await press(inDialog("Delete"));
      expect(deleteAutomation).toHaveBeenCalledWith("a1");
    } finally {
      await teardown(container, root);
    }
  });

  it("closes the dialog to show a failed delete", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    deleteAutomation.mockRejectedValue(new Error("Could not delete"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Edit");
      await clickButton(container, "Delete");
      await press(inDialog("Delete"));
      expect(dialog()).toBeNull();
      await waitForText(container, "Could not delete");
    } finally {
      vi.restoreAllMocks();
      await teardown(container, root);
    }
  });
});

describe("PlaylistDetail listens", () => {
  it("changes the sort and the window", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Recently played · Last 3 months");
      await clickButton(container, "Most played");
      await waitForText(container, "Most played · Last 3 months");
      // jsdom has no layout, and the select scrolls its current option into view.
      Element.prototype.scrollIntoView = () => {};
      const pick = (el) => act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await pick(container.querySelector('[aria-label="Time window"]'));
      await pick([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === "All time"));
      await waitForText(container, "Most played · All time");
    } finally {
      await teardown(container, root);
    }
  });
});

describe("PlaylistDetail progress", () => {
  it("runs once on arrival from the Creator, says so, and forgets it", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    runAutomationNow.mockClear();
    runAutomationNow.mockRejectedValue(new Error("API 409: Your listening history is still loading. Run this when it finishes."));
    pollProgress.mockImplementation(async () => null);

    const { container, root } = await renderDetail({ pathname: "/playlists/a1", state: { created: "Created.", runNow: true } });
    try {
      await waitForText(container, "still loading");
      expect(container.textContent).toContain("Created.");
      expect(runAutomationNow).toHaveBeenCalledTimes(1);
    } finally {
      await teardown(container, root);
    }
  });

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
    runAutomationNow.mockResolvedValue({
      id: "h1",
      status: "completed",
      tracks_before_filter: 10,
      tracks_after_filter: 3,
    });
    getRunProgress.mockResolvedValue({ stage: "source", done: 3, total: 10 });
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

  it("shows every track and each stage's count after preview Load", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    const tracks = Array.from({ length: 20 }, (_, i) => ({ title: `Song ${i + 1}`, artist: "Artist" }));
    previewAutomation.mockResolvedValue({
      tracks,
      total: 20,
      before_filter: 5708,
      after_filter: 135,
      cancelled: false,
    });
    getPreviewProgress.mockResolvedValue({ stage: "source", done: 2, total: 4 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Load");
      await clickButton(container, "Load");
      await waitForText(container, "5708 in window → 135 match filters → 20 in playlist");
      expect(container.textContent).toContain("Song 20");
      expect(container.textContent).not.toContain("Settings changed");
    } finally {
      await teardown(container, root);
    }
  });

  it("marks the preview stale instead of reworking it when a setting changes", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    previewAutomation.mockResolvedValue({
      tracks: [{ title: "Song", artist: "Artist" }],
      total: 1,
      before_filter: 1,
      after_filter: 1,
      cancelled: false,
    });
    getPreviewProgress.mockResolvedValue({ stage: "source", done: 0, total: 1 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Load");
      await clickButton(container, "Load");
      await waitForText(container, "1 in window");
      await clickButton(container, "Most played");
      await waitForText(container, "Settings changed");
      expect(container.textContent).toContain("Song");
      expect(previewAutomation).toHaveBeenCalledTimes(1);
    } finally {
      await teardown(container, root);
    }
  });

  it("says how many artists have known tags when a tag filter is on", async () => {
    getAutomation.mockResolvedValue({
      ...AUTOMATION,
      filterGroups: [{ id: "g", conditions: [{ id: "c", field: "tags", operator: "contains", value: "rap" }], groups: [] }],
    });
    getAutomationHistory.mockResolvedValue([]);
    previewAutomation.mockResolvedValue({
      tracks: [],
      total: 0,
      before_filter: 9,
      after_filter: 0,
      window_artists: 30,
      known_tag_artists: 12,
      cancelled: false,
    });
    getPreviewProgress.mockResolvedValue({ stage: "source", done: 0, total: 1 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Load");
      await clickButton(container, "Load");
      await waitForText(container, "Tags known for 12 of 30 artists");
      expect(container.textContent).toContain("No tracks found");
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
    getRunProgress.mockResolvedValue({ stage: "source", done: 1, total: 5 });
    pollProgress.mockImplementation(async (getSnapshot, opts) => {
      const snapshot = await getSnapshot();
      opts?.onUpdate?.(snapshot);
      return snapshot;
    });

    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Run now");
      await clickButton(container, "Run now");
      await waitForText(container, "Automation already running");
      expect(container.textContent).not.toContain("API 409");
      expect(container.textContent).not.toContain("Starting...");
    } finally {
      await teardown(container, root);
    }
  });

  it("shows Failed, not Done, when the run comes back failed", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    runAutomationNow.mockResolvedValue({ id: "h1", status: "failed" });
    pollProgress.mockResolvedValue({});
    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Run now");
      await clickButton(container, "Run now");
      await waitForText(container, "Failed");
      expect(container.textContent).not.toContain("Done");
    } finally {
      await teardown(container, root);
    }
  });

  it("greys Run while the history loads and frees it when it finishes", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    getScrobbleSync.mockResolvedValueOnce({ stage: "sync", complete: false });
    const { container, root } = await renderDetail();
    const runButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Run now"));
    try {
      await waitForText(container, "Runs can start once");
      expect(runButton().disabled).toBe(true);
      getScrobbleSync.mockResolvedValueOnce({ stage: "done", complete: true });
      for (let i = 0; i < 400 && runButton().disabled; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });
      }
      expect(runButton().disabled).toBe(false);
    } finally {
      await teardown(container, root);
    }
  }, 10000);

  it("saves unsaved changes before the run, and does not run if the save fails", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    runAutomationNow.mockResolvedValue({ id: "h1", status: "completed" });
    pollProgress.mockResolvedValue({});
    const { container, root } = await renderDetail();
    try {
      await waitForText(container, "Run now");
      await clickButton(container, "Most played");
      await waitForText(container, "Save & run");

      updateAutomation.mockRejectedValueOnce(new Error("API 500: nope"));
      await clickButton(container, "Save & run");
      await waitForText(container, "the run did not start");
      expect(runAutomationNow).not.toHaveBeenCalled();

      updateAutomation.mockResolvedValueOnce({});
      await clickButton(container, "Save & run");
      await waitForText(container, "Run now");
      expect(updateAutomation.mock.calls[1][1].sort).toBe("most_played");
      expect(updateAutomation.mock.invocationCallOrder[1]).toBeLessThan(runAutomationNow.mock.invocationCallOrder[0]);
    } finally {
      await teardown(container, root);
    }
  });

  it("shows an error when preview Load fails", async () => {
    getAutomation.mockResolvedValue(AUTOMATION);
    getAutomationHistory.mockResolvedValue([]);
    previewAutomation.mockRejectedValue(new Error("API 502: Unable to fetch tracks"));
    getPreviewProgress.mockResolvedValue({ stage: "source", done: 1, total: 5 });
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
