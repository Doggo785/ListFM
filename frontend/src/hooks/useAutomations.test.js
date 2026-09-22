import { describe, expect, it } from "vitest";
import { countByAutomation } from "@/hooks/useAutomations";

describe("countByAutomation", () => {
  it("groups counts by automation_id", () => {
    const result = countByAutomation([
      { automation_id: "a1" },
      { automation_id: "a1" },
      { automation_id: "a2" },
    ]);
    expect(result).toEqual({ a1: 2, a2: 1 });
  });

  it("skips playlists without automation_id", () => {
    const result = countByAutomation([
      { automation_id: null },
      { name: "orphan" },
      { automation_id: "a1" },
    ]);
    expect(result).toEqual({ a1: 1 });
  });

  it("returns empty object for empty list", () => {
    expect(countByAutomation([])).toEqual({});
  });
});
