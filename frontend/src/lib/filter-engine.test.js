import { describe, expect, it } from "vitest";
import { applyFilters } from "@/lib/filter-engine";

const groups = (operator) => [{ conditions: [{ field: "tags", operator, value: "rock" }] }];

describe("tag filters", () => {
  it("never match a track whose tags were not looked up", () => {
    for (const operator of ["contains", "not_contains", "eq"]) {
      expect(applyFilters([{ title: "x" }], groups(operator))).toEqual([]);
    }
  });

  it("treat a known empty list as no tag", () => {
    const track = { title: "x", artist_tags: [] };
    expect(applyFilters([track], groups("not_contains"))).toEqual([track]);
  });
});
