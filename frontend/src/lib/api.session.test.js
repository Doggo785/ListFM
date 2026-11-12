import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request, setSessionExpiredHandler } from "@/lib/api";

const response = (status) => ({
  ok: status < 400,
  status,
  text: async () => "{}",
  json: async () => ({}),
});

describe("session expiry", () => {
  const onExpired = vi.fn();

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    setSessionExpiredHandler(onExpired);
  });

  afterEach(() => {
    setSessionExpiredHandler(null);
    onExpired.mockReset();
    vi.restoreAllMocks();
  });

  it("calls the handler when the refresh after a 401 fails", async () => {
    globalThis.fetch.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401));
    await expect(request("/api/automations")).rejects.toThrow(/401/);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the refresh succeeds", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));
    await request("/api/automations");
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe("error messages", () => {
  it("reads a validation error's list instead of printing [object Object]", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: [{ msg: "Value error, Invalid cron expression: x" }, { msg: "Too long" }] }),
    }));
    await expect(request("/x")).rejects.toThrow("API 422: Invalid cron expression: x Too long");
  });
});

describe("when the server can't answer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says so in words a person can act on", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("NetworkError when attempting to fetch resource."));
    await expect(request("/api/automations")).rejects.toThrow("Can't reach ListFM right now. Check your connection, then try again.");
  });

  it("gives up after a while instead of waiting forever", async () => {
    globalThis.fetch = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    }));
    await expect(request("/api/automations", { timeoutMs: 20 })).rejects.toThrow("ListFM is taking too long to answer. Try again in a moment.");
  });
});
