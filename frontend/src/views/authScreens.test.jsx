// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "./AuthCallback";
import ConfirmEmail from "./ConfirmEmail";
import ForgotPassword from "./ForgotPassword";
import LastfmReturn from "./LastfmReturn";
import LinkLastfm from "./LinkLastfm";
import Login from "./Login";
import Register from "./Register";
import ResetPassword from "./ResetPassword";

const auth = vi.hoisted(() => ({ value: {} }));
const api = vi.hoisted(() => ({ request: vi.fn(), connectLastfm: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/api", async (original) => ({ ...(await original()), ...api }));
vi.mock("@/components/dashboard/ForgedName", () => ({ default: ({ name }) => <h1>{name}</h1> }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function type(element, value) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
function Landed() {
  return <output>{useLocation().pathname}</output>;
}

describe("the screens before the site", () => {
  let host;
  let root;
  const show = async (url, element, value = {}) => {
    auth.value = { isAuthenticated: false, isLastfmLinked: false, loading: false, ...value };
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={url.split("?")[0]} element={element} />
            <Route path="*" element={<Landed />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  };
  const fill = (values) => act(async () => Object.entries(values).forEach(([id, value]) => type(host.querySelector(`#${id}`), value)));
  const submit = () => act(async () => host.querySelector("form").requestSubmit());
  const alert = () => host.querySelector('[role="alert"]')?.textContent;
  const landed = () => host.querySelector("output")?.textContent;

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

  describe("Login", () => {
    it("asks for both fields before calling the server", async () => {
      const login = vi.fn();
      await show("/login", <Login />, { login });
      await submit();
      expect(login).not.toHaveBeenCalled();
      expect(alert()).toBe("Enter your email and your password.");
    });

    it("shows the server's message without the status code", async () => {
      const login = vi.fn().mockRejectedValue(new Error("API 401: Invalid email or password"));
      await show("/login", <Login />, { login });
      await fill({ email: "me@example.com", password: "wrong-password" });
      await submit();
      expect(login).toHaveBeenCalledWith("me@example.com", "wrong-password");
      expect(alert()).toBe("Invalid email or password");
    });

    it("leaves for the dashboard once logged in", async () => {
      await show("/login", <Login />, { isAuthenticated: true });
      expect(landed()).toBe("/dashboard");
    });

    it("offers a new link when the address was never confirmed", async () => {
      const login = vi.fn().mockRejectedValue(new Error("API 403: Confirm your email first."));
      await show("/login", <Login />, { login });
      await fill({ email: "me@example.com", password: "long-enough" });
      await submit();
      expect(alert()).toBe("Confirm your email first.");
      expect(host.textContent).toContain("Send a new link");
      expect(host.querySelector('a[href="/forgot-password"]')).not.toBeNull();
    });

    it("reveals the password on demand", async () => {
      await show("/login", <Login />, { login: vi.fn() });
      await act(async () => host.querySelector('[aria-label="Show password"]').click());
      expect(host.querySelector("#password").type).toBe("text");
      await act(async () => host.querySelector('[aria-label="Hide password"]').click());
      expect(host.querySelector("#password").type).toBe("password");
    });
  });

  describe("Register", () => {
    it.each([
      [{ "register-email": "nope", "register-password": "long-enough", "register-confirm": "long-enough" }, "valid email"],
      [{ "register-email": "me@example.com", "register-password": "short", "register-confirm": "short" }, "at least 8"],
      [{ "register-email": "me@example.com", "register-password": "long-enough", "register-confirm": "different" }, "are different"],
    ])("refuses %j", async (values, message) => {
      const register = vi.fn();
      await show("/register", <Register />, { register });
      await fill(values);
      await submit();
      expect(register).not.toHaveBeenCalled();
      expect(alert()).toContain(message);
    });

    it("waits for the mailed link, and can send it again", async () => {
      const register = vi.fn().mockResolvedValue({ detail: "We sent you a link." });
      await show("/register", <Register />, { register });
      await fill({ "register-email": "Me@Example.com", "register-password": "long-enough", "register-confirm": "long-enough" });
      await submit();
      expect(register).toHaveBeenCalledWith("Me@Example.com", "long-enough");
      expect(host.querySelector("h2").textContent).toBe("Check your inbox");
      expect(host.textContent).toContain("me@example.com");
      api.request.mockResolvedValue({ detail: "A new link is on its way." });
      await submit();
      expect(api.request).toHaveBeenCalledWith("/api/auth/confirm/resend", expect.objectContaining({ body: JSON.stringify({ email: "me@example.com" }) }));
      expect(host.querySelector('[role="status"]').textContent).toBe("A new link is on its way.");
      await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Start again").click());
      expect(host.querySelector("#register-email")).not.toBeNull();
    });

    it("says when the email is taken", async () => {
      const register = vi.fn().mockRejectedValue(new Error("API 409: An account with this email already exists"));
      await show("/register", <Register />, { register });
      await fill({ "register-email": "me@example.com", "register-password": "long-enough", "register-confirm": "long-enough" });
      await submit();
      expect(alert()).toBe("An account with this email already exists");
    });
  });

  describe("the mailed links", () => {
    it("confirms the address once, then goes on to Last.fm", async () => {
      const confirmEmail = vi.fn().mockResolvedValue();
      await show("/confirm-email?token=abc", <ConfirmEmail />, { confirmEmail });
      expect(confirmEmail).toHaveBeenCalledTimes(1);
      expect(confirmEmail).toHaveBeenCalledWith("abc");
      expect(landed()).toBe("/link-lastfm");
    });

    it("offers a new link when the old one no longer works", async () => {
      const confirmEmail = vi.fn().mockRejectedValue(new Error("API 400: This link no longer works. Ask for a new one."));
      await show("/confirm-email?token=old", <ConfirmEmail />, { confirmEmail });
      expect(alert()).toBe("This link no longer works. Ask for a new one.");
      expect(host.querySelector("#resend-email")).not.toBeNull();
    });

    it("mails a reset link and says the same thing whoever asks", async () => {
      api.request.mockResolvedValue({ detail: "If an account uses this address, a link is on its way." });
      await show("/forgot-password", <ForgotPassword />);
      await submit();
      expect(alert()).toBe("Enter the email you signed up with.");
      await fill({ "forgot-email": "me@example.com" });
      await submit();
      expect(api.request).toHaveBeenCalledWith("/api/auth/password/forgot", expect.objectContaining({ body: JSON.stringify({ email: "me@example.com" }) }));
      expect(host.querySelector('[role="status"]').textContent).toContain("a link is on its way");
    });

    it("says why a link could not be asked for", async () => {
      api.request.mockRejectedValue(new Error("API 429: Too many requests. Please try again later."));
      await show("/forgot-password", <ForgotPassword />);
      await fill({ "forgot-email": "me@example.com" });
      await submit();
      expect(alert()).toBe("Too many requests. Please try again later.");
    });

    it("sets the new password and signs in", async () => {
      const resetPassword = vi.fn().mockResolvedValue();
      await show("/reset-password?token=abc", <ResetPassword />, { resetPassword });
      await fill({ "reset-password": "long-enough", "reset-again": "different" });
      await submit();
      expect(alert()).toBe("The two passwords are different.");
      await fill({ "reset-again": "long-enough" });
      await submit();
      expect(resetPassword).toHaveBeenCalledWith("abc", "long-enough");
      expect(landed()).toBe("/dashboard");
    });

    it("can't be used without its token", async () => {
      await show("/reset-password", <ResetPassword />, { resetPassword: vi.fn() });
      expect(alert()).toContain("no longer works");
      expect(host.querySelector('button[type="submit"]').disabled).toBe(true);
    });
  });

  describe("LinkLastfm", () => {
    it("has nothing to type and opens Last.fm", async () => {
      await show("/link-lastfm", <LinkLastfm />);
      expect(host.querySelector("input")).toBeNull();
      await act(async () => host.querySelector("button").click());
      expect(api.connectLastfm).toHaveBeenCalled();
    });

    it("shows why Last.fm could not be opened", async () => {
      api.connectLastfm.mockRejectedValue(new Error("API 503: Last.fm is not configured"));
      await show("/link-lastfm", <LinkLastfm />);
      await act(async () => host.querySelector("button").click());
      expect(alert()).toBe("Last.fm is not configured");
    });

    it("skips to the dashboard when already linked", async () => {
      await show("/link-lastfm", <LinkLastfm />, { isLastfmLinked: true });
      expect(landed()).toBe("/dashboard");
    });
  });

  describe("LastfmReturn", () => {
    it("spends the token once, then goes to the dashboard on a first link", async () => {
      const finishLastfmLink = vi.fn().mockResolvedValue({ username: "doggo", first_link: true });
      await show("/auth/lastfm?state=s&token=t", <LastfmReturn />, { finishLastfmLink });
      expect(finishLastfmLink).toHaveBeenCalledTimes(1);
      expect(finishLastfmLink).toHaveBeenCalledWith("t", "s");
      expect(landed()).toBe("/dashboard");
    });

    it("goes back to the settings after a change of account", async () => {
      const finishLastfmLink = vi.fn().mockResolvedValue({ username: "doggo", first_link: false });
      await show("/auth/lastfm?state=s&token=t", <LastfmReturn />, { finishLastfmLink });
      expect(landed()).toBe("/settings");
    });

    it.each([[false, "/link-lastfm"], [true, "/settings"]])("offers a way back when refused (linked: %s)", async (isLastfmLinked, way) => {
      const finishLastfmLink = vi.fn().mockRejectedValue(new Error("API 400: Your Last.fm authorization expired. Please try again."));
      await show("/auth/lastfm?state=s&token=t", <LastfmReturn />, { finishLastfmLink, isLastfmLinked });
      expect(alert()).toBe("Your Last.fm authorization expired. Please try again.");
      expect(host.querySelector(`a[href="${way}"]`).textContent).toBe("Try again");
    });
  });

  describe("AuthCallback", () => {
    it.each([
      [{ isAuthenticated: false }, "/login"],
      [{ isAuthenticated: true, isLastfmLinked: false }, "/link-lastfm"],
      [{ isAuthenticated: true, isLastfmLinked: true }, "/dashboard"],
    ])("routes %j", async (value, way) => {
      await show("/auth/callback", <AuthCallback />, value);
      expect(landed()).toBe(way);
    });

    it("waits while the session is loading", async () => {
      await show("/auth/callback", <AuthCallback />, { loading: true });
      expect(landed()).toBeUndefined();
      expect(host.textContent).toContain("Signing in");
    });

    it("shows a failed sign-in with a way back", async () => {
      await show("/auth/callback?error=1&error_description=Denied", <AuthCallback />);
      expect(alert()).toBe("Denied");
      expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    });

    it("asks for the email Discord did not share", async () => {
      await show("/auth/callback?needs_email=1", <AuthCallback />, { isAuthenticated: true });
      await submit();
      expect(alert()).toBe("Enter an email address.");
      await fill({ "oauth-email": "me@example.com" });
      await submit();
      expect(api.request).toHaveBeenCalledWith("/api/auth/oauth/complete-email", { method: "POST", body: JSON.stringify({ email: "me@example.com" }) });
      expect(landed()).toBe("/link-lastfm");
    });

    it("shows why the email was refused", async () => {
      api.request.mockRejectedValue(new Error("API 409: This email is taken"));
      await show("/auth/callback?needs_email=1", <AuthCallback />, { isAuthenticated: true });
      await fill({ "oauth-email": "me@example.com" });
      await submit();
      expect(alert()).toBe("This email is taken");
    });
  });
});
