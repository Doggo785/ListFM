// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Automations from "./Automations";

const hook = vi.hoisted(() => ({ value: {} }));
vi.mock("@/hooks/useAutomations", () => ({ useAutomations: () => hook.value }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { lastfm_username: "doggo" } }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const AUTOMATION = { id: "a1", name: "Seasonal", cron: "0 0 1 3,6,9,12 *", enabled: true, sort: "most_played", window: { length: { amount: 3, unit: "month" } }, filterGroups: [] };
const LOADED = { generatedPlaylists: [{ automation_id: "a1", cover_images: ["https://img/a.png"] }], automations: [AUTOMATION], counts: new Map([["a1", 2]]), isLoading: false, error: null, refetch: vi.fn() };

describe("Automations", () => {
  let host;
  let root;
  const show = async () => {
    await act(async () => root.render(<MemoryRouter><Automations /></MemoryRouter>));
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

  it("presents each automation with its schedule and how much it made", async () => {
    await show();
    const card = host.querySelector('a[href="/automations/a1"]');
    expect(card.textContent).toContain("Seasonal");
    expect(card.textContent).toContain("Every season");
    expect(card.textContent).toContain("2 playlists");
    expect(card.querySelector("img").getAttribute("src")).toBe("https://img/a.png");
  });

  it("says when an automation is paused", async () => {
    hook.value = { ...LOADED, automations: [{ ...AUTOMATION, enabled: false }] };
    await show();
    expect(host.querySelector('a[href="/automations/a1"]').textContent).toContain("Paused");
  });

  it("doesn't claim zero playlists when their list failed", async () => {
    hook.value = { ...LOADED, playlistsFailed: true };
    await show();
    expect(host.querySelector('a[href="/automations/a1"]').textContent).not.toContain("playlist");
  });

  it("explains an empty list and keeps the way to create", async () => {
    hook.value = { ...LOADED, automations: [] };
    await show();
    expect(host.textContent).toContain("No automation yet");
    expect(host.querySelector('a[href="/automations/new"]')).toBeTruthy();
  });

  it("offers to retry a failed list", async () => {
    hook.value = { ...LOADED, automations: [], error: "API 500" };
    await show();
    await act(async () => host.querySelector('[role="alert"] button').click());
    expect(LOADED.refetch).toHaveBeenCalled();
  });
});
