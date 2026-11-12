// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotFound from "./NotFound";

const auth = vi.hoisted(() => ({ value: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));

describe("an unknown address", () => {
  let host;
  let root;
  const show = async (isAuthenticated) => {
    auth.value = { isAuthenticated };
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><NotFound /></MemoryRouter>));
  };

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("says so and leads a signed-in person back to their dashboard", async () => {
    await show(true);
    expect(host.querySelector("h1").textContent).toBe("Page not found");
    expect(host.querySelector("a").getAttribute("href")).toBe("/dashboard");
  });

  it("leads a visitor back to the home page", async () => {
    await show(false);
    expect(host.querySelector("a").getAttribute("href")).toBe("/");
  });
});
