// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAutomations, getGeneratedPlaylists } from "@/lib/api";
import { forgetPlaylist, useAutomations } from "./useAutomations";

vi.mock("@/lib/api", () => ({ getAutomations: vi.fn(), getGeneratedPlaylists: vi.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("useAutomations", () => {
  let host;
  let root;
  let renders;
  function Probe({ username }) {
    renders.push(useAutomations(username));
    return null;
  }
  const show = async (username) => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    renders = [];
    await act(async () => root.render(<Probe username={username} />));
    return renders;
  };
  const leave = async () => {
    await act(async () => root.unmount());
    host.remove();
  };

  beforeEach(() => {
    getAutomations.mockReset().mockResolvedValue([{ id: "a" }]);
    getGeneratedPlaylists.mockReset().mockResolvedValue([{ id: "p", automation_id: "a" }, { id: "q", automation_id: "a" }]);
  });
  afterEach(leave);

  it("shows what it read last at once when the page comes back, then refreshes", async () => {
    await show("back");
    await leave();
    const again = await show("back");
    expect(again[0].isLoading).toBe(false);
    expect(again[0].generatedPlaylists).toHaveLength(2);
    expect(again[0].counts.get("a")).toBe(2);
    expect(getGeneratedPlaylists).toHaveBeenCalledTimes(2);
  });

  it("never shows one account's lists to another", async () => {
    await show("first");
    await leave();
    const other = await show("second");
    expect(other[0].isLoading).toBe(true);
    expect(other[0].generatedPlaylists).toEqual([]);
  });

  it("forgets a deleted playlist", async () => {
    await show("deleting");
    await leave();
    forgetPlaylist("p");
    getGeneratedPlaylists.mockResolvedValue([{ id: "q", automation_id: "a" }]);
    const again = await show("deleting");
    expect(again[0].generatedPlaylists.map((playlist) => playlist.id)).toEqual(["q"]);
  });

  it("says when only the playlists failed, and keeps the automations", async () => {
    getGeneratedPlaylists.mockRejectedValue(new Error("API 500"));
    const list = await show("failing");
    const last = list.at(-1);
    expect(last.playlistsFailed).toBe(true);
    expect(last.automations).toEqual([{ id: "a" }]);
    expect(last.error).toBe(null);
  });
});
