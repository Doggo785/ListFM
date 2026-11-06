// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import demo from "./demo.json";
import { BREATH_SECONDS, createShow, FUSE_SECONDS } from "./show";

function fakeStage() {
  return {
    W: 300,
    H: 200,
    e: Array.from({ length: 9 }, (_, i) => i + 1),
    cream: 99,
    ink: 100,
    put: vi.fn(),
    mark: vi.fn(),
    crumb: vi.fn(),
    crumbs: vi.fn(),
    thread: vi.fn(),
    veil: vi.fn(),
  };
}

function place(name) {
  const element = document.createElement("div");
  element.dataset.show = name;
  return element;
}

describe("createShow", () => {
  let stage;
  let root;
  let onChange;
  let onLit;
  const make = (intro = true) => createShow({ stage, demo, root, intro, onChange, onLit });

  beforeEach(() => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 800);
    stage = fakeStage();
    root = document.createElement("main");
    for (const name of ["name", "line", "promise", "bar", "pin"]) root.appendChild(place(name));
    const story = root.appendChild(place("story"));
    story.getBoundingClientRect = () => ({ top: 800, bottom: 9000, height: 8200, left: 0, right: 1200, width: 1200 });
    onChange = vi.fn();
    onLit = vi.fn();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("breathes first, then lights the fuse once", () => {
    const show = make();
    for (let t = 0; t < 0.5; t += 0.05) show.frame(0.05);
    expect(onLit).not.toHaveBeenCalled();
    expect(stage.thread).not.toHaveBeenCalled();
    expect(stage.put).toHaveBeenCalled();
    for (let t = 0; t < BREATH_SECONDS + 0.2; t += 0.05) show.frame(0.05);
    expect(onLit).toHaveBeenCalledTimes(1);
    expect(stage.thread).toHaveBeenCalled();
  });

  it("hides the name until the fuse reaches it, then leaves it alone", () => {
    const show = make();
    show.frame(0.016);
    expect(stage.veil.mock.calls[0][2]).toBe(-1);
    for (let t = 0; t < BREATH_SECONDS + FUSE_SECONDS + 1.5; t += 0.05) show.frame(0.05);
    stage.veil.mockClear();
    show.frame(0.016);
    expect(stage.veil).not.toHaveBeenCalled();
  });

  it("gives the fuse's place to the name it sets alight", () => {
    const show = make();
    show.frame(0.016);
    expect(show.fuseHead(0)).toBeLessThan(10);
    expect(show.fuseHead(FUSE_SECONDS)).toBe(stage.W);
    expect(show.forgeHead(FUSE_SECONDS)).toBe(stage.W);
    show.sparkAt(4, 5);
    expect(stage.crumb.mock.calls.at(-1).slice(0, 2)).toEqual([4, 5]);
  });

  it("starts at rest for a visitor who has seen it", () => {
    const show = make(false);
    show.frame(0.016);
    expect(stage.thread).toHaveBeenCalled();
    expect(stage.veil).not.toHaveBeenCalled();
  });

  it("does nothing until the page is laid out", () => {
    root.innerHTML = "";
    const show = make();
    show.frame(0.016);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lays its squares out again when the window changes", () => {
    const show = make(false);
    stage.W = 100;
    stage.onResize();
    show.frame(0.016);
    expect(onChange).toHaveBeenCalledWith("hero", null);
  });

  it("leans toward a pointer once nothing else happens", () => {
    const show = make(false);
    show.pointer(400, 700);
    for (let i = 0; i < 60; i += 1) show.frame(0.05);
    const { c } = stage.thread.mock.calls.at(-1)[0];
    expect(c(100)).toBeGreaterThan(0);
    root.scrollTop = 500;
    show.frame(0.05);
    root.scrollTop = 0;
    show.frame(0.05);
    expect(stage.thread).toHaveBeenCalled();
  });

  it("heats the thread under a name being typed, and reveals the name when it comes", () => {
    const line = root.appendChild(place("turn-line"));
    line.getBoundingClientRect = () => ({ top: 300, bottom: 400, height: 100, left: 0, right: 1200, width: 1200 });
    const name = root.appendChild(place("turn-name"));
    name.getBoundingClientRect = () => ({ top: 100, bottom: 200, height: 100, left: 0, right: 600, width: 600 });
    const show = make(false);
    show.frame(0.016);
    const calm = stage.thread.mock.calls.at(-1)[0].blaze;
    show.keystroke();
    show.frame(0.016);
    expect(stage.thread.mock.calls.at(-1)[0].blaze).toBeGreaterThan(calm);
    stage.veil.mockClear();
    show.forged();
    show.frame(0.5);
    expect(stage.veil).toHaveBeenCalled();
  });

  it("runs the last thread up to the button, and not past it", () => {
    const line = root.appendChild(place("end-line"));
    line.getBoundingClientRect = () => ({ top: 500, bottom: 550, height: 50, left: 0, right: 1000, width: 1000 });
    const button = root.appendChild(place("end-button"));
    button.getBoundingClientRect = () => ({ top: 500, bottom: 550, height: 50, left: 1000, right: 1200, width: 200 });
    const show = make(false);
    show.frame(0.016);
    expect(stage.thread.mock.calls.at(-1)[0].to).toBeLessThanOrEqual(250);
    expect(stage.thread.mock.calls.at(-1)[0].to).toBeGreaterThan(200);
  });

  it("leaves a line alone while it's off screen", () => {
    const line = root.appendChild(place("turn-line"));
    line.getBoundingClientRect = () => ({ top: 5000, bottom: 5100, height: 100, left: 0, right: 1200, width: 1200 });
    const show = make(false);
    show.frame(0.016);
    const drawn = stage.thread.mock.calls.length;
    expect(drawn).toBe(1);
  });
});
