import { describe, expect, it } from "vitest";
import { coverageDates, describeCoverage, shelfLoad, shelvesOf, tracksAsText } from "./playlists";

describe("describeCoverage", () => {
  it("names the period a playlist covers, its dates underneath", () => {
    expect(describeCoverage({ period_start: "2026-06-01", period_end: "2026-08-31" })).toBe("Summer 2026");
    expect(describeCoverage({ period_start: "2025-12-01", period_end: "2026-02-28" })).toBe("Winter 2025–26");
    expect(coverageDates({ start: "2025-12-01", end: "2026-02-28" })).toBe("Dec 1, 2025 to Feb 28, 2026");
    // A period with no calendar name is already its dates: nothing to repeat underneath.
    expect(describeCoverage({ period_start: "2026-01-20", period_end: "2026-04-19" })).toBe("Jan 20 to Apr 19, 2026");
    expect(coverageDates({ start: "2026-01-20", end: "2026-04-19" })).toBeNull();
  });

  it("says up to when for every listen", () => {
    expect(describeCoverage({ period_start: null, period_end: "2026-11-05" })).toBe("Up to Nov 5, 2026");
  });

  it("falls back on the day it was made for an older playlist", () => {
    expect(describeCoverage({ period_start: null, period_end: null, generated_at: "2026-11-04T12:00:00Z" })).toBe("Made Nov 4, 2026");
  });
});

describe("shelvesOf", () => {
  const automations = [{ id: "a", name: "Now named", cron: "" }];

  it("puts each automation's playlists together, the latest fed first", () => {
    const shelves = shelvesOf(
      [
        { id: "1", automation_id: "b", name: "Old" },
        { id: "2", automation_id: "a", name: "Then named" },
        { id: "3", automation_id: "b", name: "Old" },
      ],
      automations,
    );
    expect(shelves.map((shelf) => shelf.playlists.map((p) => p.id))).toEqual([["1", "3"], ["2"]]);
  });

  it("names a shelf after its automation today, or after the playlist once the automation is gone", () => {
    const [gone, alive] = shelvesOf(
      [
        { id: "1", automation_id: "deleted", name: "Old" },
        { id: "2", automation_id: "a", name: "Then named" },
      ],
      automations,
    );
    expect(gone).toMatchObject({ name: "Old", cadence: null });
    expect(alive).toMatchObject({ name: "Now named", cadence: "No schedule" });
  });
});

describe("missing periods on a shelf", () => {
  const seasonal = { id: "s", name: "Seasons", cron: "0 0 1 3,6,9,12 *" };

  it("slots each missing period between the playlists by period, whenever they were made", () => {
    const [shelf] = shelvesOf(
      [
        { id: "winter", automation_id: "s", period_end: "2024-02-29", generated_at: "2026-11-20T10:00:00Z" },
        { id: "summer", automation_id: "s", period_end: "2026-08-31", generated_at: "2026-09-01T00:00:00Z" },
      ],
      [seasonal],
      [{ automation_id: "s", as_of: "2026-06-01T00:00:00Z", start: "2026-03-01", end: "2026-05-31", status: "missing" }],
    );
    expect(shelf.items.map((item) => item.id ?? item.end)).toEqual(["summer", "2026-05-31", "winter"]);
    expect(shelf.oldest.id).toBe("winter");
    expect(shelf.unit).toBe("season");
  });

  it("gives a shelf to an automation with only missing periods", () => {
    const shelves = shelvesOf([], [seasonal], [{ automation_id: "s", as_of: "x", start: "2026-06-01", end: "2026-08-31", status: "missing" }]);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]).toMatchObject({ name: "Seasons", playlists: [], oldest: null });
  });

  it("warns from 45 playlists and burns the oldest more and more up to 50", () => {
    expect(shelfLoad(44)).toEqual({ warning: null, burn: 0 });
    expect(shelfLoad(45).warning).toBe("45 of 50 playlists kept · The oldest period goes when a new one is made");
    expect(shelfLoad(45).burn).toBeCloseTo(1 / 6);
    expect(shelfLoad(50).burn).toBe(1);
  });
});

describe("shelf cadence", () => {
  it("says when an automation is paused", () => {
    const [paused] = shelvesOf([{ id: "1", automation_id: "s" }], [{ id: "s", name: "S", enabled: false, cron: "0 0 1 3,6,9,12 *" }]);
    expect(paused.cadence).toBe("Paused");
  });

  it("names a seasonal schedule, and says when an automation has none", () => {
    const [seasonal] = shelvesOf([{ id: "1", automation_id: "s" }], [{ id: "s", name: "S", cron: "0 0 1 3,6,9,12 *" }]);
    expect(seasonal.cadence).toBe("Every season");
    const [odd] = shelvesOf([{ id: "1", automation_id: "s" }], [{ id: "s", name: "S", cron: "not a cron" }]);
    expect(odd.cadence).toBe("not a cron");
  });
});

describe("tracksAsText", () => {
  it("writes one track per line", () => {
    expect(tracksAsText([{ artist: "A", title: "x" }, { artist: "B", title: "y" }])).toBe("A - x\nB - y");
  });
});
