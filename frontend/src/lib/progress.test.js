import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPreview,
  getPreviewProgress,
  getRunProgress,
  newProgressToken,
  pollProgress,
  previewAutomation,
  setCurrentUsername,
} from "@/lib/api";

describe("newProgressToken", () => {
  it("returns a non-empty string", () => {
    expect(typeof newProgressToken()).toBe("string");
    expect(newProgressToken().length).toBeGreaterThan(0);
  });

  it("returns unique values", () => {
    expect(newProgressToken()).not.toBe(newProgressToken());
  });
});

describe("progress endpoints", () => {
  beforeEach(() => {
    setCurrentUsername("testuser");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setCurrentUsername(null);
  });

  it("previewAutomation sends the token when given", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tracks: [] }),
    });
    await previewAutomation({ name: "x" }, "tok-1");
    const [, options] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      automation: { name: "x" },
      progress_token: "tok-1",
    });
  });

  it("previewAutomation omits the token when absent", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tracks: [] }),
    });
    await previewAutomation({ name: "x" });
    const [, options] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ automation: { name: "x" } });
  });

  it("getPreviewProgress GETs the ticket URL", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ stage: "done", done: 1, total: 1 }),
    });
    const result = await getPreviewProgress("tok-1");
    expect(result.stage).toBe("done");
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/automations/preview-progress/tok-1");
  });

  it("cancelPreview DELETEs and resolves null on 204", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 204 });
    const result = await cancelPreview("tok-1");
    expect(result).toBeNull();
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/automations/preview-progress/tok-1");
    expect(options.method).toBe("DELETE");
  });

  it("getRunProgress GETs the run progress URL", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ stage: "enrich", done: 2, total: 5 }),
    });
    const result = await getRunProgress("a1");
    expect(result.done).toBe(2);
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/automations/a1/run-progress");
  });

  it("newProgressToken falls back without randomUUID", () => {
    vi.stubGlobal("crypto", {});
    expect(typeof newProgressToken()).toBe("string");
  });
});

describe("pollProgress", () => {
  it("resolves immediately on a terminal snapshot", async () => {
    const getSnapshot = vi.fn(async () => ({ stage: "done", done: 5, total: 5 }));
    const snapshot = await pollProgress(getSnapshot);
    expect(snapshot.stage).toBe("done");
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("polls until done and reports updates", async () => {
    const snapshots = [
      { stage: "queued", done: 0, total: 0 },
      { stage: "enrich", done: 3, total: 10 },
      { stage: "done", done: 10, total: 10 },
    ];
    const getSnapshot = vi.fn(async () => snapshots.shift());
    const seen = [];
    const snapshot = await pollProgress(getSnapshot, {
      intervalMs: 1,
      onUpdate: (s) => seen.push(s.stage),
    });
    expect(snapshot.stage).toBe("done");
    expect(seen).toEqual(["queued", "enrich", "done"]);
  });

  it("resolves on error stage instead of throwing", async () => {
    const getSnapshot = vi.fn(async () => ({ stage: "error", done: 0, total: 0 }));
    const snapshot = await pollProgress(getSnapshot);
    expect(snapshot.stage).toBe("error");
  });

  it("throws a timeout error after timeoutMs", async () => {
    const getSnapshot = vi.fn(async () => ({ stage: "enrich", done: 1, total: 10 }));
    await expect(
      pollProgress(getSnapshot, { intervalMs: 1, timeoutMs: 5 })
    ).rejects.toMatchObject({ code: "PROGRESS_TIMEOUT" });
    expect(getSnapshot.mock.calls.length).toBeGreaterThan(1);
  });

  it("stops early when shouldStop is set", async () => {
    const getSnapshot = vi.fn(async () => ({ stage: "enrich", done: 1, total: 10 }));
    let stop = false;
    const promise = pollProgress(getSnapshot, {
      intervalMs: 1,
      shouldStop: () => stop,
    });
    stop = true;
    const snapshot = await promise;
    expect(snapshot.stage).toBe("enrich");
  });
});
