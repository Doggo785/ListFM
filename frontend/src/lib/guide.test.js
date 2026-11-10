import { beforeEach, describe, expect, it } from "vitest";
import { EDITOR, EDITOR_START, STEPS, arrived, canGoOn, guide, guideContext, guidesEditor, onRoute } from "@/lib/guide";

const step = (id) => STEPS.find((s) => s.id === id);
const AUTOMATION_PAGE = "/automations/0b7c1d2e-3f40-4a5b-9c6d-7e8f90a1b2c3";
const IMPORTING = guideContext({ complete: false, stage: "sync", eta_seconds: 720, tags_total: 0 });
const DONE = guideContext({ complete: true, stage: "done", tags_total: 0 });

describe("the guide's steps", () => {
  it("goes from the Dashboard through the editor, field by field, to the new automation's page", () => {
    expect(STEPS.map((s) => s.id)).toEqual(["status", "flame", "new", "window", "refine", "sort", "size", "schedule", "name", "preview", "create", "welcome"]);
    expect(STEPS[EDITOR_START].id).toBe("window");
    expect(STEPS.slice(EDITOR_START, -1).every((s) => s.route === EDITOR)).toBe(true);
    expect(onRoute(step("welcome"), AUTOMATION_PAGE)).toBe(true);
    expect(onRoute(step("welcome"), EDITOR)).toBe(false);
  });

  it("moves on by itself only where the user's own click leads", () => {
    expect(arrived(step("new"), EDITOR)).toBe(true);
    expect(arrived(step("create"), AUTOMATION_PAGE)).toBe(true);
    expect(arrived(step("create"), EDITOR)).toBe(false);
    expect(arrived(step("window"), EDITOR)).toBe(false);
  });

  it("offers Next once the step's field is filled, and never on a step the user ends by a click", () => {
    expect(canGoOn(step("flame"), {})).toBe(true);
    expect(canGoOn(step("window"), {})).toBe(false);
    expect(canGoOn(step("window"), { window: true })).toBe(true);
    expect(canGoOn(step("create"), { window: true })).toBe(false);
  });

  it("tells the import going on from the one done, with its time left", () => {
    expect(IMPORTING).toMatchObject({ importing: true, left: "about 12 min left" });
    expect(step("status").title(IMPORTING)).toBe("Your listens are on their way");
    expect(step("status").text(IMPORTING)).toContain("about 12 min left");
    expect(step("status").title(DONE)).toBe("Your listens are in");
    expect(guideContext({ complete: false, stage: "error" }).importing).toBe(false);
  });

  it("asks for patience with the filters only while the import or the tags are on their way", () => {
    expect(step("refine").note(IMPORTING)).toContain("wait until your import is over");
    expect(step("refine").note(guideContext({ complete: true, tags_total: 300 }))).toContain("wait");
    expect(step("refine").note(DONE)).toBeNull();
  });

  it("says when the first playlist comes, during the import or not", () => {
    expect(step("create").text(IMPORTING)).toContain("as soon as your listens are in");
    expect(step("welcome").note(IMPORTING)).toContain("as soon as your listens are in, about 12 min left");
    expect(step("welcome").note(DONE)).not.toContain("as soon as");
    expect(step("preview").text(guideContext(null, { empty: true }))).toContain("fill up as you listen");
    expect(step("preview").text(guideContext(null, { partial: true }))).toContain("still arriving");
    expect(step("preview").text(IMPORTING)).not.toContain("still arriving");
  });

  it("names the thread as the landing page does, from the Dashboard, where it burns as a flame, to the welcome", () => {
    const words = STEPS.flatMap((s) => [IMPORTING, DONE].flatMap((c) => [s.title(c), s.text(c), s.note?.(c) ?? ""]));
    expect(words.join(" ")).not.toMatch(/ribbon|mascot/i);
    expect(step("flame").title(DONE)).toBe("This is your thread");
    expect(step("welcome").text(DONE)).toContain("Your thread is lit");
  });
});

describe("where the viewer is in the guide", () => {
  beforeEach(() => guide.set({ on: false, step: 0, filled: {}, automation: null, endedFor: null }));

  it("starts from the first step with nothing filled, and remembers who ended it", () => {
    guide.set({ step: 6, filled: { window: true }, endedFor: "u1" });
    guide.start();
    expect(guide.get()).toMatchObject({ on: true, step: 0, filled: {}, endedFor: "u1" });
  });

  it("fills the editor's fields one by one, and runs the editor blank only on its steps", () => {
    guide.start();
    expect(guidesEditor(guide.get())).toBe(false);
    guide.set({ step: EDITOR_START });
    guide.fill("window");
    expect(guide.get().filled).toEqual({ window: true });
    expect(guidesEditor(guide.get())).toBe(true);
  });
});
