import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGeneratedPlaylists,
  getGeneratedPlaylist,
  setCurrentUsername,
} from "@/lib/api";

describe("getGeneratedPlaylists", () => {
  beforeEach(() => {
    setCurrentUsername("testuser");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setCurrentUsername(null);
  });

  it("GETs /api/generated-playlists with credentials", async () => {
    const payload = [
      { id: "gp-1", automation_id: "auto-1", name: "Weekly", track_count: 20 },
    ];
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const result = await getGeneratedPlaylists();

    expect(result).toEqual(payload);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/generated-playlists");
    expect(options.credentials).toBe("include");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("throws when no username is set", async () => {
    setCurrentUsername(null);
    await expect(getGeneratedPlaylists()).rejects.toThrow(/No username/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("surfaces API error detail", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ detail: "Link your Last.fm account" }),
    });

    await expect(getGeneratedPlaylists()).rejects.toThrow(
      "API 403: Link your Last.fm account"
    );
  });
});

describe("getGeneratedPlaylist", () => {
  beforeEach(() => {
    setCurrentUsername("testuser");
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setCurrentUsername(null);
  });

  it("GETs /api/generated-playlists/:id", async () => {
    const payload = { id: "gp-1", automation_id: "auto-1", name: "Weekly" };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const result = await getGeneratedPlaylist("gp-1");

    expect(result).toEqual(payload);
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/api/generated-playlists/gp-1");
  });
});
