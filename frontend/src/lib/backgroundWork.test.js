import { describe, expect, it } from "vitest";
import { frontAt, historyBand, monthsSince, monthStart, moveHead, runEnded, timeLeft, workFrom } from "@/lib/backgroundWork";

describe("timeLeft", () => {
  it("says nothing until the server can tell, then rounds to what a person reads", () => {
    expect(timeLeft(null)).toBeNull();
    expect(timeLeft(0)).toBe("under a minute left");
    expect(timeLeft(59)).toBe("under a minute left");
    expect(timeLeft(370)).toBe("about 6 min left");
    expect(timeLeft(3600)).toBe("about 1 h left");
    expect(timeLeft(4800)).toBe("about 1 h 20 min left");
  });
});

describe("workFrom and frontAt", () => {
  const task = (share, until, eta = 100) => ({ kind: "listens", share, eta, since: "2020-01-01T00:00:00Z", until });

  it("moves the front on at the pace the estimate gives, and stops guessing after two missed reads", () => {
    const work = workFrom(task(0.5, null), null, 0);
    expect(work.perSecond).toBeCloseTo(0.005);
    expect(frontAt(work, 2000).share).toBeCloseTo(0.51);
    expect(frontAt(work, 60000).share).toBeCloseTo(0.53);
  });

  it("does not move without an estimate, and ends at 1 once done", () => {
    const work = workFrom(task(0.2, null, null), null, 0);
    expect(frontAt(work, 5000).share).toBe(0.2);
    expect(frontAt({ ...work, doneAt: 5000 }, 5000).share).toBe(1);
  });

  it("measures the date's speed between two reads that moved it, and keeps it through a read that did not", () => {
    const first = workFrom(task(0.1, "2021-01-01T00:00:00Z"), null, 0);
    expect(first.untilPerSecond).toBe(0);
    const second = workFrom(task(0.2, "2021-01-02T00:00:00Z"), first, 3000);
    expect(second.untilPerSecond).toBeCloseTo((24 * 3600 * 1000) / 3);
    const still = workFrom(task(0.2, "2021-01-02T00:00:00Z"), second, 6000);
    expect(still.untilPerSecond).toBe(second.untilPerSecond);
    expect(still.untilAt).toBe(3000);
    expect(frontAt(still, 4500).until).toBe(Date.parse("2021-01-02T12:00:00Z"));
  });

  it("starts over when the work changes kind", () => {
    const listens = workFrom(task(0.9, "2021-01-01T00:00:00Z"), null, 0);
    const tags = workFrom({ kind: "tags", share: 0.1, eta: 50 }, listens, 1000);
    expect(tags).toMatchObject({ kind: "tags", until: null, untilPerSecond: 0 });
  });
});

describe("the history band", () => {
  const yearStart = new Date(2025, 11, 1).getTime();

  it("counts months from the first one shown, with the share of the month reached", () => {
    expect(monthStart(new Date(2026, 10, 15).getTime(), 11)).toBe(yearStart);
    expect(monthsSince(yearStart, new Date(2026, 1, 1).getTime())).toBe(2);
    expect(monthsSince(yearStart, new Date(2026, 1, 15).getTime())).toBe(2.5);
  });

  it("gives the years before the one shown a first part of the band, then the year", () => {
    const since = new Date(2020, 0, 1).getTime();
    const middle = since + (yearStart - since) / 2;
    expect(historyBand({ since, until: middle, yearStart, origin: yearStart, width: 1000 })).toEqual({ yearX: 400, perMonth: 50, frontX: 200 });
    expect(historyBand({ since, until: new Date(2026, 5, 1).getTime(), yearStart, origin: yearStart, width: 1000 }).frontX).toBe(700);
  });

  it("spreads a history younger than a year over the whole band", () => {
    const since = new Date(2026, 3, 10).getTime();
    const origin = monthStart(since);
    expect(historyBand({ since, until: new Date(2026, 4, 1).getTime(), yearStart, origin, width: 1200 })).toEqual({ yearX: 0, perMonth: 100, frontX: 100 });
  });
});

describe("runEnded", () => {
  it("is true when a run of the last read is no longer there", () => {
    const two = { kind: "run", runs: ["a", "b"] };
    expect(runEnded(two, { kind: "run", runs: ["a", "b"] })).toBe(false);
    expect(runEnded(two, { kind: "run", runs: ["b"] })).toBe(true);
    expect(runEnded(two, null)).toBe(true);
    expect(runEnded(two, { kind: "tags" })).toBe(true);
    expect(runEnded({ kind: "tags", runs: [] }, null)).toBe(false);
    expect(runEnded(null, null)).toBe(false);
  });
});

describe("the drawn front across reads", () => {
  it("keeps what the ribbon drew through a read of the same task, and starts over for another", () => {
    const first = { ...workFrom({ kind: "listens", share: 0.1, eta: 10 }, null, 0), shown: 0.12, shownKind: "listens" };
    expect(workFrom({ kind: "listens", share: 0.2, eta: 8 }, first, 3000)).toMatchObject({ shown: 0.12, shownKind: "listens" });
    expect(workFrom({ kind: "tags", share: 0, eta: 8 }, first, 3000).shown).toBeUndefined();
  });
});

describe("moveHead", () => {
  it("starts where it is wanted, and glides forward without overshooting", () => {
    expect(moveHead({ x: null, glow: 1 }, 300, 0.016)).toEqual({ x: 300, glow: 1 });
    const head = moveHead({ x: 100, glow: 1 }, 400, 0.1);
    expect(head.x).toBeGreaterThan(100);
    expect(head.x).toBeLessThan(400);
    expect(head.glow).toBe(1);
  });

  it("goes out before going back, jumps once dark, then lights up there", () => {
    let head = { x: 1200, glow: 1 };
    head = moveHead(head, 50, 0.1);
    expect(head).toEqual({ x: 1200, glow: expect.closeTo(0.6) });
    head = moveHead(head, 50, 0.2);
    expect(head).toEqual({ x: 50, glow: 0 });
    head = moveHead(head, 50, 0.125);
    expect(head.glow).toBeCloseTo(0.5);
  });
});
