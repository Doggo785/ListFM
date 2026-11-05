// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TopNav from "./TopNav";

const auth = vi.hoisted(() => ({ user: { lastfm_username: "doggo" }, avatar: null, logout: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/components/elements/BackgroundTasks", () => ({ default: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Where() {
  return <output>{useLocation().pathname}</output>;
}

describe("TopNav", () => {
  let host;
  let root;

  const show = async (path) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path="*" element={<><TopNav /><Where /></>} /></Routes>
        </MemoryRouter>,
      );
    });
  };
  const current = () => host.querySelector('[aria-current="page"]')?.textContent;

  beforeEach(() => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    auth.avatar = null;
    auth.logout.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("marks the current page, including the pages under it", async () => {
    await show("/automations/abc");
    expect(current()).toBe("Automations");
    expect(host.querySelector(".top-nav__marker").style.opacity).toBe("1");
  });

  it("tells the playlists from the automations", async () => {
    await show("/playlists/abc");
    expect(current()).toBe("Playlists");
  });

  it("hides the marker on a page outside the navigation", async () => {
    await show("/link-lastfm");
    expect(current()).toBeUndefined();
    expect(host.querySelector(".top-nav__marker").style.opacity).toBe("0");
  });

  it("keeps the ribbon away from the navigation", async () => {
    await show("/dashboard");
    expect(host.querySelectorAll("[data-quiet]")).toHaveLength(2);
  });

  it("shows the account and logs out to the landing page", async () => {
    auth.avatar = "/me.png";
    await show("/dashboard");
    expect(host.textContent).toContain("doggo");
    expect(host.querySelector("img").getAttribute("src")).toBe("/me.png");
    await act(async () => host.querySelector("button").click());
    expect(auth.logout).toHaveBeenCalledOnce();
    expect(host.querySelector("output").textContent).toBe("/");
  });
});
