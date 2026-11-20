// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Playlists from "./Playlists";

const hook = vi.hoisted(() => ({ value: {} }));
vi.mock("@/hooks/useAutomations", () => ({ useAutomations: () => hook.value }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { lastfm_username: "doggo" } }) }));
vi.mock("@/lib/glide", () => ({ glide: (go) => go(), glideArrived: () => {} }));
const api = vi.hoisted(() => ({ runAutomationNow: vi.fn() }));
vi.mock("@/lib/api", () => api);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SEASON = { id: "p1", automation_id: "a1", name: "Seasonal", track_count: 30, period_start: "2026-06-01", period_end: "2026-08-31", generated_at: "2026-09-01T00:00:00Z", cover_images: ["https://img/a.png"] };
const LOADED = { automations: [{ id: "a1", name: "Seasonal", cron: "0 0 1 3,6,9,12 *" }], generatedPlaylists: [SEASON], isLoading: false, error: null, playlistsFailed: false, refetch: vi.fn() };

function Opened() {
  const { pathname, state } = useLocation();
  return <output>{pathname} {state?.playlist?.name}</output>;
}

describe("Playlists", () => {
  let host;
  let root;
  const show = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/playlists"]}>
          <Routes>
            <Route path="/playlists" element={<Playlists />} />
            <Route path="*" element={<Opened />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  };

  beforeEach(() => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    hook.value = LOADED;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("shelves playlists under their automation with the period they cover", async () => {
    await show();
    expect(host.querySelector("h2").textContent).toBe("Seasonal");
    expect(host.textContent).toContain("Every season");
    expect(host.querySelector("section").getAttribute("aria-labelledby")).toBe(host.querySelector("h2").id);
    expect(host.textContent).toContain("Summer 2026");
    expect(host.textContent).toContain("Jun 1 to Aug 31, 2026");
    expect(host.textContent).toContain("30 tracks");
    expect(host.querySelector("[data-chain]")).toBe(null);
    expect(host.querySelector("li canvas")).toBeTruthy();
  });

  it("opens a playlist on its own page, carrying what the page shows first", async () => {
    await show();
    await act(async () => host.querySelector("li a").click());
    expect(host.querySelector("output").textContent).toBe("/playlists/p1 Seasonal");
  });

  it("slots a missing season by period and makes it on the spot", async () => {
    const refetch = vi.fn();
    const spring = { automation_id: "a1", as_of: "2026-06-01T00:00:00Z", start: "2026-03-01", end: "2026-05-31", status: "missing" };
    hook.value = { ...LOADED, pastPeriods: [spring, { ...spring, as_of: "2025-12-01T00:00:00Z", start: "2025-09-01", end: "2025-11-30", status: "empty" }], refetch };
    let finish;
    api.runAutomationNow.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await show();
    const tiles = [...host.querySelectorAll("li")].map((li) => li.textContent);
    expect(tiles[0]).toContain("Summer 2026");
    expect(tiles[1]).toContain("Spring 2026");
    expect(tiles[1]).toContain("Make it");
    expect(tiles[2]).toContain("Autumn 2025");
    expect(tiles[2]).toContain("No track matched");
    await act(async () => host.querySelector('button[aria-label="Make Spring 2026"]').click());
    expect(api.runAutomationNow).toHaveBeenCalledWith("a1", undefined, "2026-06-01T00:00:00Z");
    expect(host.textContent).toContain("Making…");
    await act(async () => finish({}));
    expect(refetch).toHaveBeenCalled();
  });

  it("warns near the playlists kept, burns the oldest, and says which one a new one removes", async () => {
    const playlists = Array.from({ length: 50 }, (_, i) => {
      const year = 2026 - Math.floor(i / 12);
      const month = 12 - (i % 12);
      const end = new Date(year, month, 0).getDate();
      return { ...SEASON, id: `p${i}`, period_start: `${year}-${String(month).padStart(2, "0")}-01`, period_end: `${year}-${String(month).padStart(2, "0")}-${end}` };
    });
    const missing = { automation_id: "a1", as_of: "2026-12-01T00:00:00Z", start: "2026-11-01", end: "2026-11-30", status: "missing" };
    hook.value = { ...LOADED, generatedPlaylists: playlists, pastPeriods: [missing] };
    await show();
    expect(host.textContent).toContain("50 of 50 playlists kept");
    expect(host.querySelector('[title="Goes next when a new playlist is made"]').textContent).toContain("November 2022");
    expect(host.querySelector('button[aria-label="Make November 2026"]').textContent).toContain("Removes November 2022");
  });

  it("offers to create an automation when there is nothing at all", async () => {
    hook.value = { ...LOADED, automations: [], generatedPlaylists: [] };
    await show();
    expect(host.querySelector('a[href="/automations/new"]').textContent).toBe("Create an automation");
  });

  it("points to the automations when none has made a playlist yet", async () => {
    hook.value = { ...LOADED, generatedPlaylists: [] };
    await show();
    expect(host.querySelector('a[href="/automations"]').textContent).toBe("See your automations");
  });

  it("says when the list failed, instead of claiming there is nothing", async () => {
    hook.value = { ...LOADED, generatedPlaylists: [], playlistsFailed: true };
    await show();
    expect(host.querySelector('[role="alert"]').textContent).toContain("could not load");
    expect(host.textContent).not.toContain("Nothing here yet");
    await act(async () => host.querySelector('[role="alert"] button').click());
    expect(LOADED.refetch).toHaveBeenCalled();
  });
});
