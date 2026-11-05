import { describe, expect, it } from "vitest";
import {
  PRESETS,
  WINDOW_OPTIONS,
  applyPreset,
  completeMoment,
  createDefaultAutomation,
  matchingPreset,
  readSchedule,
  suggestName,
  toPayload,
  writeSchedule,
  conditionForField,
  countActiveConditions,
  createCondition,
  describeAutomation,
  describeAutomationWithSchedule,
  describeCron,
  describePeriod,
  isValidCron,
  usesTagFilter,
  windowOption,
} from "@/lib/automation-rules";

describe("automation summaries", () => {
  it("names the sort and the window", () => {
    const auto = { sort: "first_played", window: { length: { amount: 3, unit: "month" } } };
    expect(describeAutomation(auto)).toBe("Recently discovered · Last 3 months");
    expect(describeAutomationWithSchedule({ ...auto, cron: "0 8 * * *" })).toBe(
      `${describeCron("0 8 * * *")} · Recently discovered · Last 3 months`,
    );
  });

  it("matches every window option and flags unknown ones", () => {
    for (const option of WINDOW_OPTIONS) expect(windowOption(option.window)).toBe(option);
    expect(windowOption({ length: null })?.value).toBe("all");
    expect(describeAutomation({ sort: "random", window: { length: { amount: 2, unit: "day" } } })).toBe(
      "Random · Custom window",
    );
  });
});

describe("filter conditions", () => {
  it("drops the old value when the field changes", () => {
    const number = createCondition({ value: 20, valueMax: 30, operator: "between", countMin: 40 });
    expect(conditionForField(number, "tags")).toMatchObject({ field: "tags", operator: "contains", value: "", valueMax: null, countMin: 0 });
    expect(conditionForField(number, "userloved")).toMatchObject({ operator: "is", value: true });
    expect(conditionForField(number, "timestamp")).toMatchObject({ operator: "within_days", value: "" });
    expect(conditionForField(number, "playcount")).toMatchObject({ operator: "gte", value: "" });
  });

  it("counts only the conditions the server will apply", () => {
    const complete = { operator: "gte", value: 0 };
    const groups = [
      {
        conditions: [complete, { operator: "gte", value: "" }, { operator: "between", value: 1, valueMax: null }],
        groups: [{ conditions: [{ operator: "between", value: 1, valueMax: 2 }, { operator: "contains", value: "  " }] }],
      },
    ];
    expect(countActiveConditions(groups)).toBe(2);
    expect(countActiveConditions(null)).toBe(0);
  });

  it("spots a filled tag filter at any depth", () => {
    const tag = (value) => ({ field: "tags", operator: "contains", value });
    expect(usesTagFilter([{ conditions: [], groups: [{ conditions: [tag("rap")] }] }])).toBe(true);
    expect(usesTagFilter([{ conditions: [tag("")] }])).toBe(false);
    expect(usesTagFilter([{ conditions: [{ field: "playcount", operator: "gte", value: 1 }] }])).toBe(false);
  });
});

describe("schedule", () => {
  it.each([
    ["0 8 * * *", "daily", "Every day at 08:00"],
    ["30 7 * * 1", "weekly", "Every Monday at 07:30"],
    ["0 8 * * 7", "weekly", "Every Sunday at 08:00"],
    ["0 0 1 * *", "monthly", "The 1st of every month at 00:00"],
    ["0 0 22 */3 *", "quarterly", "Every 3 months, on the 22nd, at 00:00"],
    ["0 0 1 3,6,9,12 *", "seasonal", "The 1st of March, June, September and December at 00:00"],
    ["0 9 2 1 *", "yearly", "Every year, January 2nd, at 09:00"],
  ])("reads %s", (cron, frequency, text) => {
    expect(readSchedule(cron).frequency).toBe(frequency);
    expect(describeCron(cron)).toBe(text);
  });

  it("writes back what it read", () => {
    for (const cron of ["5 8 * * *", "5 8 * * 3", "5 8 12 * *", "5 8 12 */3 *", "5 8 12 3,6,9,12 *", "5 8 12 6 *"]) {
      expect(writeSchedule(readSchedule(cron))).toBe(cron);
    }
  });

  it("leaves anything else to the custom box, unaltered", () => {
    for (const cron of ["0 8 * * 1-5", "*/5 * * * *", "0 8 1,15 * *", "0 8 31 * *"]) {
      expect(readSchedule(cron).frequency).toBe("custom");
      expect(describeCron(cron)).toBe(cron);
    }
    expect(readSchedule("0 8").frequency).toBe("custom");
    expect(readSchedule("").frequency).toBe("none");
    expect(writeSchedule({ frequency: "none" })).toBe("");
  });
});

describe("listening moment", () => {
  it("never leaves a range half set or empty", () => {
    expect(completeMoment({ fromDay: 6, toDay: null, fromHour: null, toHour: null })).toMatchObject({ fromDay: 6, toDay: 6 });
    expect(completeMoment({ fromHour: 23, toHour: 23 })).toMatchObject({ fromHour: 23, toHour: 0 });
    expect(completeMoment({ fromDay: null, toDay: 3, fromHour: null, toHour: 5 })).toEqual({ fromDay: 1, toDay: 7, fromHour: null, toHour: null });
  });
});

describe("presets and names", () => {
  const draft = () => createDefaultAutomation();

  it("starts a new draft on Top tracks", () => {
    expect(matchingPreset(draft()).id).toBe("top");
    expect(suggestName(draft())).toBe("Top tracks");
  });

  it("recognises every preset once applied", () => {
    for (const preset of PRESETS) expect(matchingPreset(applyPreset(draft(), preset))).toBe(preset);
  });

  it("names the settings once they leave the preset", () => {
    expect(suggestName({ ...draft(), sort: "random" })).toBe("Random · Last 3 months");
    expect(matchingPreset({ ...draft(), output: { maxSize: 50, maxPerAlbum: 2 } })).toBeUndefined();
  });

  it("gives seasonal its three-month rhythm", () => {
    const seasonal = applyPreset(draft(), PRESETS.find((p) => p.id === "seasonal"));
    expect(seasonal.cron).toBe("0 0 1 3,6,9,12 *");
    expect(windowOption(seasonal.window).value).toBe("3m");
  });

  it("fills in what a half-edited draft left blank", () => {
    const payload = toPayload({
      ...draft(),
      window: { length: { amount: null, unit: "week" }, ago: { amount: null, unit: "year" } },
      output: { maxSize: null },
    });
    expect(payload.window).toEqual({ length: { amount: 1, unit: "week" }, ago: null });
    expect(payload.output.maxSize).toBe(50);
  });
});

describe("describePeriod", () => {
  it("names the dates, with the first year only when it differs", () => {
    expect(describePeriod({ start: "2026-06-01", end: "2026-08-31" })).toBe("Jun 1 to Aug 31, 2026");
    expect(describePeriod({ start: "2025-12-01", end: "2026-02-28" })).toBe("Dec 1, 2025 to Feb 28, 2026");
    expect(describePeriod({ start: null, end: "2026-08-31" })).toBe("all your listens up to Aug 31, 2026");
    expect(describePeriod(undefined)).toBeNull();
  });
});

describe("isValidCron", () => {
  it("catches what the server would refuse, and leaves names to it", () => {
    for (const cron of ["0 0 1 3,6,9,12 *", "*/5 * * * *", "0 8 * * 1-5", "0 8 * * 7", "0 0 last * *", "0 8 * * mon-fri", "0-30/5 8 1,15 * *"]) {
      expect(isValidCron(cron), cron).toBe(true);
    }
    for (const cron of ["0 0", "99 0 * * *", "0 24 * * *", "0 0 0 * *", "0 0 * 13 *", "0 0 * * 8", "*/0 * * * *", "0 0 * * 1-9", "@ * * * *", "", null]) {
      expect(isValidCron(cron), String(cron)).toBe(false);
    }
  });
});
