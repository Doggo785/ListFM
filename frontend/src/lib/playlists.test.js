import { describe, expect, it } from "vitest";
import { describeCoverage, shelvesOf, tracksAsText } from "./playlists";

describe("describeCoverage", () => {
  it("says the dates a playlist covers", () => {
    expect(describeCoverage({ period_start: "2026-06-01", period_end: "2026-08-31" })).toBe("Jun 1 to Aug 31, 2026");
    expect(describeCoverage({ period_start: "2025-12-01", period_end: "2026-02-28" })).toBe("Dec 1, 2025 to Feb 28, 2026");
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
