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
