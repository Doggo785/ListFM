// @vitest-environment jsdom
import React, { act } from "react";
// Custom createRoot rendering (no testing library): tell React act() is supported.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request, setSessionExpiredHandler } from "@/lib/api";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import CronEditor from "@/components/builder/CronEditor";

vi.mock("@/lib/api", () => ({
  request: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

async function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(element);
  });
  return container;
}

beforeEach(() => {
  vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
    resolvedOptions: () => ({ timeZone: "Europe/Paris" }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  request.mockReset();
});

describe("browser timezone", () => {
  it("sends the browser zone while the account has none", async () => {
    request.mockResolvedValue({ timezone: null });
    await render(<AuthProvider>x</AuthProvider>);
    expect(request).toHaveBeenCalledWith("/api/auth/me/timezone", {
      method: "PUT",
      body: JSON.stringify({ timezone: "Europe/Paris" }),
    });
  });

  it("never overwrites a zone the account already has", async () => {
    request.mockResolvedValue({ timezone: "Asia/Tokyo" });
    await render(<AuthProvider>x</AuthProvider>);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("shows the zone next to the schedule", async () => {
    const container = await render(<CronEditor value="0 8 * * *" onChange={() => {}} />);
    expect(container.textContent).toContain("(Europe/Paris)");
  });

  it("prefers the account's zone next to the schedule", async () => {
    const container = await render(<CronEditor value="0 8 * * *" onChange={() => {}} zone="Asia/Tokyo" />);
    expect(container.textContent).toContain("(Asia/Tokyo)");
  });
});

describe("expired session", () => {
  it("logs the user out when the API reports a failed refresh", async () => {
    request.mockResolvedValue({ timezone: "Europe/Paris", lastfm_username: "u" });
    function Probe() {
      const { isAuthenticated } = useAuth();
      return isAuthenticated ? "in" : "out";
    }
    const container = await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(container.textContent).toBe("in");
    const onExpired = setSessionExpiredHandler.mock.calls.at(-1)[0];
    await act(async () => onExpired());
    expect(container.textContent).toBe("out");
  });
});

describe("profile avatar", () => {
  it("fetches the Last.fm profile once and shares the avatar", async () => {
    request.mockImplementation(async (path) =>
      path === "/api/info"
        ? { image: "https://last.fm/a.png" }
        : { timezone: "Europe/Paris", lastfm_username: "u" }
    );
    function Probe() {
      const { avatar } = useAuth();
      return avatar || "none";
    }
    const container = await render(
      <AuthProvider>
        <Probe />
        <Probe />
      </AuthProvider>
    );
    expect(container.textContent).toBe("https://last.fm/a.png".repeat(2));
    expect(request.mock.calls.filter(([path]) => path === "/api/info")).toHaveLength(1);
  });

  it("falls back to no avatar when the profile call fails", async () => {
    request.mockImplementation(async (path) => {
      if (path === "/api/info") throw new Error("down");
      return { timezone: "Europe/Paris", lastfm_username: "u" };
    });
    function Probe() {
      const { avatar } = useAuth();
      return avatar || "none";
    }
    const container = await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(container.textContent).toBe("none");
  });
});
