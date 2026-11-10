// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITOR_START, guide } from "@/lib/guide";
import Guide from "./Guide";

const auth = vi.hoisted(() => ({ value: {} }));
const sync = vi.hoisted(() => ({ value: null }));
const api = vi.hoisted(() => ({ setGuideDone: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/hooks/useScrobbleSync", () => ({ useScrobbleSync: () => sync.value }));
vi.mock("@/lib/api", () => api);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NEWCOMER = { id: "u1", lastfm_username: "doggo", guide_done_at: null };

function Where() {
  return <output id="where">{useLocation().pathname}</output>;
}

describe("Guide", () => {
  let host;
  let root;
  const show = async (user = NEWCOMER, at = "/dashboard") => {
    auth.value = { user, refreshUser: vi.fn() };
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[at]}>
          <Guide />
          <Where />
          <Routes>
            <Route path="/dashboard" element={<div className="background-task">Importing</div>} />
            <Route path="/automations/new" element={<section data-guide-step="window"><button type="button">Choose a window</button></section>} />
            <Route path="/playlists" element={<p>playlists</p>} />
          </Routes>
        </MemoryRouter>,
      );
    });
  };
  const bubble = () => document.querySelector('[role="dialog"]');
  const button = (name) => [...document.querySelectorAll("button")].find((b) => b.textContent === name);
  const click = (name) => act(async () => button(name).click());
  const where = () => document.querySelector("#where").textContent;

  beforeEach(() => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    guide.set({ on: false, step: 0, filled: {}, automation: null, endedFor: null });
    sync.value = { complete: false, stage: "sync", eta_seconds: 720, tags_total: 0 };
    api.setGuideDone.mockReset().mockResolvedValue({});
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("starts by itself for a newcomer, and keeps them company during the import", async () => {
    await show();
    expect(bubble().getAttribute("aria-modal")).toBe("false");
    expect(bubble().textContent).toContain("Your listens are on their way");
    expect(bubble().textContent).toContain("about 12 min left");
    expect(bubble().textContent).toContain("1/12");
  });

  it("never starts by itself once finished or skipped, here or on another device", async () => {
    await show({ ...NEWCOMER, guide_done_at: "2026-11-10T12:00:00Z" });
    expect(bubble()).toBeNull();
  });

  it("is skipped for good: the account remembers it, and it does not come back", async () => {
    await show();
    await click("Skip");
    expect(bubble()).toBeNull();
    expect(api.setGuideDone).toHaveBeenCalledWith(true);
    await show();
    expect(bubble()).toBeNull();
  });

  it("closes with Escape, but leaves Escape to a field", async () => {
    await show();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(bubble()).toBeNull();
    expect(api.setGuideDone).toHaveBeenCalledWith(true);
  });

  it("goes on with Next, back with Back, and offers its own way to the editor when the page has none", async () => {
    await show();
    await click("Next");
    expect(bubble().textContent).toContain("This is your thread");
    await click("Back");
    expect(bubble().textContent).toContain("Your listens are");
    await click("Next");
    await click("Next");
    await click("New automation");
    expect(where()).toBe("/automations/new");
    expect(bubble().textContent).toContain("Pick a window");
  });

  it("waits for the field it asks for, with the focus in it", async () => {
    guide.set({ on: true, step: EDITOR_START, filled: {} });
    await show(NEWCOMER, "/automations/new");
    expect(button("Next")).toBeUndefined();
    expect(bubble().textContent).toContain("Choose a window");
    expect(document.activeElement.textContent).toBe("Choose a window");
    await act(async () => guide.fill("window"));
    expect(button("Next")).toBeDefined();
  });

  it("waits off its path, and takes the user back to the editor's first step", async () => {
    guide.set({ on: true, step: EDITOR_START + 2, filled: { window: true } });
    await show(NEWCOMER, "/playlists");
    expect(bubble()).toBeNull();
    await click("Resume guide · 6/12");
    expect(where()).toBe("/automations/new");
    expect(guide.get()).toMatchObject({ step: EDITOR_START, filled: {} });
  });
});
