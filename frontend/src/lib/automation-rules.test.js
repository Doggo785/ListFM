import { describe, expect, it } from "vitest";
import {
  WINDOW_OPTIONS,
  conditionForField,
  countActiveConditions,
  createCondition,
  describeAutomation,
  describeAutomationWithSchedule,
  describeCron,
  usesTagFilter,
  windowOption,
} from "@/lib/automation-rules";
import { getPlaylistImageSrc } from "@/lib/playlist-logo";

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

  it("draws the playlist icon from the sort", () => {
    expect(getPlaylistImageSrc("x", "random")).not.toBe(getPlaylistImageSrc("x", "most_played"));
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
