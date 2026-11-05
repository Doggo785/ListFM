import { describe, expect, it, vi } from "vitest";
import { burstEmber, createEmberLayer, emberTone, inQuad, inRect, stepEmbers } from "./ribbonEmbers";

const rect = { left: 0, top: 0, width: 10, height: 10 };

describe("inRect", () => {
  it("includes the edges", () => {
    expect(inRect(10, 10, rect)).toBe(true);
    expect(inRect(11, 5, rect)).toBe(false);
  });
});

describe("inQuad", () => {
  // A tilted card: its bounding box holds corners that are not on the card.
  const corners = [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }];

  it("tells the card's face from its box's empty corners", () => {
    expect(inQuad(50, 50, corners)).toBe(true);
    expect(inQuad(5, 5, corners)).toBe(false);
  });
});

describe("stepEmbers", () => {
  const spawnAway = () => ({ x: 100, y: 100 });

  it("tops the calm embers up to what is wanted, a few per frame", () => {
    let embers = stepEmbers([], 0.016, 3, spawnAway, [], 0);
    expect(embers).toHaveLength(2);
    embers = stepEmbers(embers, 0.016, 3, spawnAway, [], 0);
    expect(embers).toHaveLength(3);
    embers = stepEmbers(embers, 0.016, 3, spawnAway, [], 0);
    expect(embers).toHaveLength(3);
  });

  it("makes them climb and drops them once their life is over", () => {
    const [ember] = stepEmbers([], 0.016, 1, spawnAway, [], 0);
    const y = ember.y;
    stepEmbers([ember], 0.1, 1, spawnAway, [], 0);
    expect(ember.y).toBeLessThan(y);
    expect(stepEmbers([ember], 100, 0, spawnAway, [], 0)).toHaveLength(0);
  });

  it("loses the ones that reach content", () => {
    const [ember] = stepEmbers([], 0.016, 1, () => ({ x: 5, y: 5 }), [], 0);
    expect(stepEmbers([ember], 0.001, 0, spawnAway, [rect], 0)).toHaveLength(0);
  });

  it("is never born on a cover, and dies reaching one", () => {
    const card = { corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };
    expect(stepEmbers([], 0.016, 5, () => ({ x: 5, y: 5 }), [card], 0)).toHaveLength(0);
    const [ember] = stepEmbers([], 0.016, 1, () => ({ x: 5, y: 5 }), [], 0);
    expect(stepEmbers([ember], 0.001, 0, spawnAway, [card], 0)).toHaveLength(0);
  });

  it("does nothing when there is nowhere to spawn from", () => {
    expect(stepEmbers([], 0.016, 5, () => null, [], 0)).toHaveLength(0);
  });

  it("does not count a burst among the calm ones", () => {
    const embers = stepEmbers([burstEmber(50, 50)], 0.001, 1, spawnAway, [], 0);
    expect(embers).toHaveLength(2);
  });
});

describe("burstEmber", () => {
  it("flies up and falls back", () => {
    const ember = burstEmber(1, 2);
    expect(ember.vy).toBeLessThan(0);
    expect(ember.gravity).toBeGreaterThan(0);
  });
});

describe("emberTone", () => {
  it("goes down the ramp with age", () => {
    const tones = ["hot", "warm", "dark"];
    expect(emberTone({ age: 0, life: 1 }, tones)).toBe("hot");
    expect(emberTone({ age: 0.5, life: 1 }, tones)).toBe("warm");
  });

  it("blinks out at the very end", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(emberTone({ age: 0.99, life: 1 }, ["hot"])).toBeNull();
    vi.restoreAllMocks();
  });
});

describe("createEmberLayer", () => {
  const fakeGl = () => {
    const calls = {};
    return new Proxy({}, {
      get: (_, name) => (name === "calls" ? calls : (...args) => {
        (calls[name] ||= []).push(args);
        return {};
      }),
    });
  };

  it("draws nothing without embers", () => {
    const gl = fakeGl();
    createEmberLayer(gl, [[1, 1, 1]]).draw([], 4, 800, 100, 100);
    expect(gl.calls.drawArrays).toBeUndefined();
  });

  it("draws one point per ember, and never more than it holds", () => {
    const gl = fakeGl();
    const layer = createEmberLayer(gl, [[1, 1, 1]]);
    layer.draw(Array.from({ length: 400 }, () => ({ x: 4, y: 8, age: 0, life: 1 })), 4, 800, 100, 100);
    expect(gl.calls.drawArrays[0][2]).toBe(320);
  });
});
