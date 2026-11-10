// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guide } from "@/lib/guide";
import Settings from "./Settings";

const auth = vi.hoisted(() => ({ value: {} }));
const api = vi.hoisted(() => ({ request: vi.fn(), connectLastfm: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/api", async (original) => ({ ...(await original()), ...api }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const USER = { email: "me@example.com", timezone: "Asia/Tokyo", lastfm_username: "doggo", has_password: true };

function type(element, value) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
const button = (name) => [...document.querySelectorAll("button")].find((b) => b.textContent === name);

describe("Settings", () => {
  let host;
  let root;
  const show = async (user = USER) => {
    auth.value = { user, refreshUser: vi.fn(), forgetUser: vi.fn() };
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/settings"]}>
          <Routes>
            <Route path="/settings" element={<Settings />} />
            <Route path="/" element={<output>home</output>} />
            <Route path="/dashboard" element={<output>dashboard</output>} />
          </Routes>
        </MemoryRouter>,
      );
    });
  };
  const click = (name) => act(async () => button(name).click());
  const submit = (selector) => act(async () => document.querySelector(selector).requestSubmit());

  beforeEach(() => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    api.request.mockReset().mockResolvedValue({});
    api.connectLastfm.mockReset().mockResolvedValue();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const search = async (text) => {
    const box = host.querySelector('input[aria-label="Time zone"]');
    await act(async () => box.focus());
    await act(async () => type(box, text));
    return box;
  };
  const options = () => [...host.querySelectorAll('[role="option"]')];

  it("shows the zone in use, and only what the search finds", async () => {
    await show();
    expect(host.querySelector('input[aria-label="Time zone"]').value).toBe("Asia/Tokyo");
    await search("new y");
    expect(options().map((o) => o.textContent.split("GMT")[0])).toEqual(["America/New York"]);
  });

  it("never shows more than a handful of zones", async () => {
    await show();
    await search("a");
    expect(options().length).toBe(8);
  });

  it("offers the device's zone and the one in use before any search", async () => {
    await show();
    await search("");
    expect(options().map((o) => o.textContent.split("GMT")[0])).toEqual([Intl.DateTimeFormat().resolvedOptions().timeZone, "Asia/Tokyo"].map((z) => z.replaceAll("_", " ")));
  });

  it("finds UTC, which the browser's own list leaves out", async () => {
    await show();
    await search("utc");
    expect(options().map((o) => o.textContent.split("GMT")[0])).toContain("UTC");
  });

  it("says when nothing matches", async () => {
    await show();
    await search("zzz");
    expect(host.textContent).toContain("No match");
  });

  it("saves a time zone as soon as it is picked", async () => {
    await show();
    await search("paris");
    await act(async () => options()[0].click());
    expect(api.request).toHaveBeenCalledWith("/api/auth/me/timezone", { method: "PUT", body: JSON.stringify({ timezone: "Europe/Paris" }) });
    expect(host.textContent).toContain("Saved");
    expect(auth.value.refreshUser).toHaveBeenCalled();
    expect(host.querySelector('input[aria-label="Time zone"]').value).toBe("Europe/Paris");
  });

  it("picks with the keyboard and lets go with Escape", async () => {
    await show();
    const box = await search("paris");
    const press = (key) => act(async () => box.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    await press("Escape");
    expect(box.value).toBe("Asia/Tokyo");
    expect(api.request).not.toHaveBeenCalled();
    await search("paris");
    await press("ArrowDown");
    await press("ArrowUp");
    await press("Enter");
    expect(api.request).toHaveBeenCalledWith("/api/auth/me/timezone", { method: "PUT", body: JSON.stringify({ timezone: "Europe/Paris" }) });
  });

  it("starts a new search when typing right after a pick, the box still focused", async () => {
    await show();
    const box = await search("paris");
    await act(async () => options()[0].click());
    await act(async () => type(box, `${box.value}t`));
    expect(box.value).toBe("t");
    await act(async () => box.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => box.click());
    expect(options().length).toBeGreaterThan(0);
  });

  it("goes back to the old time zone when saving fails", async () => {
    await show();
    api.request.mockRejectedValue(new Error("API 400: Unknown time zone"));
    await search("paris");
    await act(async () => options()[0].click());
    expect(host.querySelector('input[aria-label="Time zone"]').value).toBe("Asia/Tokyo");
    expect(host.textContent).toContain("Unknown time zone");
  });

  it("warns before leaving for Last.fm to change account", async () => {
    await show();
    await click("Change account");
    expect(api.connectLastfm).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("erases the listens");
    await click("Continue to Last.fm");
    expect(api.connectLastfm).toHaveBeenCalled();
  });

  it("offers to connect straight away when no account is linked", async () => {
    await show({ ...USER, lastfm_username: null });
    await click("Connect Last.fm");
    expect(api.connectLastfm).toHaveBeenCalled();
  });

  it("shows why Last.fm could not be opened", async () => {
    await show({ ...USER, lastfm_username: null });
    api.connectLastfm.mockRejectedValue(new Error("API 503: Last.fm is not configured"));
    await click("Connect Last.fm");
    expect(host.querySelector('[role="alert"]').textContent).toBe("Last.fm is not configured");
  });

  it("hides the password section from accounts without a password", async () => {
    await show({ ...USER, has_password: false });
    expect(host.querySelector("#current-password")).toBeNull();
  });

  it("warns about other devices and changes the password", async () => {
    await show();
    expect(host.textContent).toContain("logs you out on all your other devices");
    await act(async () => {
      type(host.querySelector("#current-password"), "old-password");
      type(host.querySelector("#new-password"), "new-password");
      type(host.querySelector("#new-password-again"), "new-password");
    });
    await submit("form");
    expect(api.request).toHaveBeenCalledWith("/api/auth/me/password", {
      method: "PUT",
      body: JSON.stringify({ current_password: "old-password", password: "new-password" }),
    });
    expect(host.textContent).toContain("Your other devices are logged out");
    expect(host.querySelector("#new-password").value).toBe("");
  });

  it.each([
    ["short", "short", "at least 8"],
    ["new-password", "other-password", "are different"],
  ])("refuses a new password %s / %s without asking the server", async (next, again, message) => {
    await show();
    await act(async () => {
      type(host.querySelector("#new-password"), next);
      type(host.querySelector("#new-password-again"), again);
    });
    await submit("form");
    expect(api.request).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]').textContent).toContain(message);
  });

  it("shows the server's refusal of the current password", async () => {
    await show();
    api.request.mockRejectedValue(new Error("API 400: Your current password is wrong"));
    await act(async () => {
      type(host.querySelector("#new-password"), "new-password");
      type(host.querySelector("#new-password-again"), "new-password");
    });
    await submit("form");
    expect(host.querySelector('[role="alert"]').textContent).toBe("Your current password is wrong");
  });

  it("deletes the account only once the email is typed, then forgets the user", async () => {
    await show();
    await click("Delete account");
    const confirm = () => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === "Delete account");
    expect(confirm().disabled).toBe(true);
    await act(async () => type(document.querySelector("#delete-confirm"), "ME@example.com"));
    expect(confirm().disabled).toBe(false);
    await submit("#delete-account");
    expect(api.request).toHaveBeenCalledWith("/api/auth/me/delete", { method: "POST", body: JSON.stringify({ confirm: "ME@example.com" }) });
    expect(auth.value.forgetUser).toHaveBeenCalled();
    expect(host.textContent).toBe("home");
  });

  it("asks for the word delete when the account has no email", async () => {
    await show({ ...USER, email: null });
    await click("Delete account");
    expect(document.querySelector('[role="dialog"]').textContent).toContain("Type delete to confirm");
  });

  it("keeps the dialog open with the reason when deleting fails", async () => {
    await show();
    await click("Delete account");
    api.request.mockRejectedValue(new Error("API 400: That does not match"));
    await act(async () => type(document.querySelector("#delete-confirm"), "me@example.com"));
    await submit("#delete-account");
    expect(document.querySelector('[role="dialog"] [role="alert"]').textContent).toBe("That does not match");
    expect(auth.value.forgetUser).not.toHaveBeenCalled();
    await click("Cancel");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("replays the newcomer's guide from the Dashboard", async () => {
    guide.set({ on: false, step: 7, endedFor: "u1" });
    await show();
    await click("Replay the guide");
    expect(guide.get()).toMatchObject({ on: true, step: 0 });
    expect(document.querySelector("output").textContent).toBe("dashboard");
    guide.set({ on: false });
  });
});
