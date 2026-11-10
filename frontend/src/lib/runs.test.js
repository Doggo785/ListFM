import { describe, expect, it } from "vitest";
import { chainsOf, dayOf, daysOf, describeRun } from "./runs";

const row = (overrides) => ({ id: "r", status: "completed", attempt: 1, scheduled_for: "2026-11-01T00:00:00Z", started_at: "2026-11-01T08:00:00Z", tracks_generated: 50, target_size: 50, ...overrides });

describe("chainsOf", () => {
  it("folds the attempts of a run into one line, newest attempt first", () => {
    const rows = [
      row({ id: "other", attempt: 1, scheduled_for: "2026-11-02T00:00:00Z" }),
      row({ id: "second", attempt: 2 }),
      row({ id: "first", attempt: 1 }),
    ];
    const chains = chainsOf(rows);
    expect(chains.map((chain) => chain.head.id)).toEqual(["other", "second"]);
    expect(chains[1].tries.map((attempt) => attempt.id)).toEqual(["second", "first"]);
  });

  it("starts a new line for a fresh run on the same scheduled date", () => {
    const chains = chainsOf([row({ id: "manual", attempt: 1 }), row({ id: "first", attempt: 1 })]);
    expect(chains).toHaveLength(2);
  });

  it("keeps a retry whose first attempts are past the list's limit", () => {
    expect(chainsOf([row({ id: "last", attempt: 3 })])[0].head.id).toBe("last");
  });
});

describe("describeRun", () => {
  const now = new Date("2026-11-05T12:00:00");

  it("says the time of the next automatic try", () => {
    const run = row({ status: "failed", next_retry_at: "2026-11-05T14:32:00" });
    expect(describeRun(run, now)).toEqual({ label: "Retrying at 14:32", tone: "alert" });
  });

  it("does not promise a time already past", () => {
    const run = row({ status: "failed", next_retry_at: "2026-11-05T11:00:00" });
    expect(describeRun(run, now).label).toBe("Retrying soon");
  });

  it("says when no automatic try is left, and only then", () => {
    const final = row({ status: "failed", attempt: 4, retries_exhausted: true });
    expect(describeRun(final).label).toBe("Failed after 4 tries · No more automatic tries");
    expect(describeRun(row({ status: "failed" })).label).toBe("Failed");
  });

  it("shows empty and short runs as neutral results", () => {
    expect(describeRun(row({ status: "empty" }))).toEqual({ label: "Empty · No track matched", tone: "muted" });
    expect(describeRun(row({ tracks_generated: 32 }))).toEqual({ label: "32/50 tracks", tone: "muted" });
  });

  it("invents no total for a run older than the stored size", () => {
    expect(describeRun(row({ tracks_generated: 32, target_size: null })).label).toBe("32 tracks");
  });

  it("gives a full run its count, and the try that made it", () => {
    expect(describeRun(row({})).label).toBe("50 tracks");
    expect(describeRun(row({ attempt: 2 })).label).toBe("50 tracks · On try 2");
    expect(describeRun(row({ tracks_generated: 1, target_size: 1 })).label).toBe("1 track");
    expect(describeRun(row({ status: "running" })).label).toBe("Running");
  });
});

describe("days", () => {
  const now = new Date("2026-11-05T12:00:00");

  it("names the two nearest days and dates the others", () => {
    expect(dayOf("2026-11-05T01:00:00", now)).toBe("Today");
    expect(dayOf("2026-11-04T23:00:00", now)).toBe("Yesterday");
    expect(dayOf("2026-10-30T12:00:00", now)).toBe("Oct 30, 2026");
  });

  it("groups runs by day in the order they come", () => {
    const chains = chainsOf([
      row({ id: "a", scheduled_for: "a", started_at: "2026-11-05T09:00:00" }),
      row({ id: "b", scheduled_for: "b", started_at: "2026-11-05T08:00:00" }),
      row({ id: "c", scheduled_for: "c", started_at: "2026-11-03T08:00:00" }),
    ]);
    expect(daysOf(chains, now).map(({ day, chains: list }) => [day, list.length])).toEqual([["Today", 2], ["Nov 3, 2026", 1]]);
  });
});

describe("a run waiting for the listens", () => {
  it("is neither a failure nor a result", () => {
    expect(describeRun({ status: "waiting", attempt: 1 })).toEqual({ label: "Waiting", tone: "muted" });
  });
});
