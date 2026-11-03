import { describe, expect, it } from "vitest";
import {
  WINDOW_OPTIONS,
  describeAutomation,
  describeAutomationWithSchedule,
  describeCron,
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
