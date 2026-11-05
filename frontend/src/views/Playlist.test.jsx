// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteGeneratedPlaylist, getGeneratedPlaylistTracks } from "@/lib/api";
import Playlist from "./Playlist";

const hook = vi.hoisted(() => ({ value: {}, forget: vi.fn() }));
vi.mock("@/hooks/useAutomations", () => ({ useAutomations: () => hook.value, forgetPlaylist: hook.forget }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { lastfm_username: "doggo" } }) }));
vi.mock("@/lib/glide", () => ({ glide: (go) => go(), glideArrived: () => {} }));
vi.mock("@/lib/api", () => ({ deleteGeneratedPlaylist: vi.fn(), getGeneratedPlaylistTracks: vi.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PLAYLIST = { id: "p1", automation_id: "a1", name: "Seasonal", track_count: 2, period_start: "2026-06-01", period_end: "2026-08-31", generated_at: "2026-09-01T00:00:00Z" };
const TRACKS = [
  { position: 0, title: "One & Two", artist: "A/B" },
  { position: 1, title: "Three", artist: "C" },
];
const LOADED = { automations: [{ id: "a1" }], generatedPlaylists: [PLAYLIST], isLoading: false, error: null, playlistsFailed: false, refetch: vi.fn() };

function Elsewhere() {
  const { pathname, state } = useLocation();
  return <output>{pathname} {state?.from}</output>;
}

describe("Playlist", () => {
  let host;
  let root;
  const show = async (entry = "/playlists/p1") => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/playlists/:id" element={<Playlist />} />
            <Route path="*" element={<Elsewhere />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  };
  const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);

  beforeEach(() => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    hook.value = LOADED;
    hook.forget.mockClear();
    deleteGeneratedPlaylist.mockReset();
    getGeneratedPlaylistTracks.mockReset().mockResolvedValue(TRACKS);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("shows the title, the period and tracks that open on Last.fm", async () => {
    await show();
    expect(host.querySelector("h1").textContent).toBe("Seasonal");
    expect(host.textContent).toContain("Jun 1 to Aug 31, 2026");
    expect(host.querySelector("ol a").href).toBe("https://www.last.fm/music/A%2FB/_/One%20%26%20Two");
    expect(host.querySelector('a[href="/automations/a1"]').textContent).toBe("See automation");
  });

  it("hides the automation's link once the automation is gone", async () => {
    hook.value = { ...LOADED, automations: [] };
    await show();
    expect(host.textContent).not.toContain("See automation");
  });

  it("copies the list, one track per line", async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await show();
    await act(async () => button("Copy list").click());
    expect(writeText).toHaveBeenCalledWith("A/B - One & Two\nC - Three");
    expect(button("Copied")).toBeTruthy();
  });

  it("copies without the clipboard API on plain HTTP", async () => {
    vi.stubGlobal("navigator", {});
    document.execCommand = vi.fn(() => true);
    await show();
    await act(async () => button("Copy list").click());
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(button("Copied")).toBeTruthy();
    expect(document.querySelector("textarea")).toBe(null);
    delete document.execCommand;
  });

  it("says when copying failed", async () => {
    vi.stubGlobal("navigator", {});
    document.execCommand = vi.fn(() => false);
    await show();
    await act(async () => button("Copy list").click());
    expect(button("Couldn't copy")).toBeTruthy();
    delete document.execCommand;
  });

  it("says when a playlist has no tracks", async () => {
    getGeneratedPlaylistTracks.mockResolvedValue([]);
    await show();
    expect(host.textContent).toContain("No tracks in this playlist");
  });

  it("deletes only once confirmed, then goes back to the shelves", async () => {
    deleteGeneratedPlaylist.mockResolvedValue();
    await show();
    await act(async () => button("Delete").click());
    expect(deleteGeneratedPlaylist).not.toHaveBeenCalled();
    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].at(-1).click());
    expect(deleteGeneratedPlaylist).toHaveBeenCalledWith("p1");
    expect(hook.forget).toHaveBeenCalledWith("p1");
    expect(host.querySelector("output").textContent.trim()).toBe("/playlists");
  });

  it("stays on the page and says so when deleting fails", async () => {
    deleteGeneratedPlaylist.mockRejectedValue(new Error("API 500"));
    await show();
    await act(async () => button("Delete").click());
    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].at(-1).click());
    expect(host.querySelector('[role="alert"]').textContent).toContain("could not be deleted");
    expect(hook.forget).not.toHaveBeenCalled();
  });

  it("offers to retry when the tracks fail", async () => {
    getGeneratedPlaylistTracks.mockRejectedValueOnce(new Error("API 500"));
    await show();
    expect(host.querySelector('[role="alert"]').textContent).toContain("could not load");
    await act(async () => button("Try again").click());
    expect(host.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("tells the way back which playlist to glide to", async () => {
    await show();
    await act(async () => host.querySelector('a[href="/playlists"]').click());
    expect(host.querySelector("output").textContent).toBe("/playlists p1");
  });

  it("sends an old automation address to the automation's page", async () => {
    await show("/playlists/a1");
    expect(host.querySelector("output").textContent.trim()).toBe("/automations/a1");
  });

  it("says a playlist is gone when the address matches nothing", async () => {
    await show("/playlists/nothing");
    expect(host.textContent).toContain("This playlist no longer exists");
  });

  it("shows the list's playlist before the list has refreshed", async () => {
    hook.value = { ...LOADED, generatedPlaylists: [], isLoading: true };
    await show({ pathname: "/playlists/p1", state: { playlist: PLAYLIST } });
    expect(host.querySelector("h1").textContent).toBe("Seasonal");
  });

  it("offers to retry when an address can't be read", async () => {
    hook.value = { ...LOADED, generatedPlaylists: [], playlistsFailed: true };
    await show();
    expect(host.querySelector('[role="alert"]').textContent).toContain("could not load");
  });
});
