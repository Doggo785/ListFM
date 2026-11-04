import { describe, expect, it } from "vitest";
import { applyFilters } from "@/lib/filter-engine";

const groups = (operator) => [{ conditions: [{ field: "tags", operator, value: "rock" }] }];

describe("listening filters", () => {
  const condition = (field, operator, value) => [{ conditions: [{ id: "c", field, operator, value }] }];

  it("read the first listen's age", () => {
    const recent = { first_played_age: 86400 };
    const old = { first_played_age: 86400 * 40 };
    expect(applyFilters([recent, old], condition("first_played", "within_days", 30))).toEqual([recent]);
  });

  it("read the artist rank of their own condition and drop unranked artists", () => {
    const top = { artist_ranks: { c: 2 } };
    const low = { artist_ranks: { c: 9 } };
    const unranked = { artist_ranks: {} };
    expect(applyFilters([top, low, unranked], condition("artist_rank", "lte", 5))).toEqual([top]);
  });
});

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
