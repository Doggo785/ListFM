// @vitest-environment jsdom
import React, { act, useState } from "react";
// Custom createRoot rendering (no testing library): tell React act() is supported.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import FilterBuilder from "@/components/builder/FilterBuilder";
import { createCondition, createGroup } from "@/lib/automation-rules";

vi.mock("@/lib/api", () => ({
  getKnownTags: vi.fn(async () => [
    { name: "rap", artists: 120 },
    { name: "french rap", artists: 1 },
  ]),
}));

let mounted;
const seen = { groups: null };

function Harness({ initial }) {
  const [groups, setGroups] = useState(initial);
  const change = (next) => {
    seen.groups = next;
    setGroups(next);
  };
  return <FilterBuilder value={groups} onChange={change} />;
}

async function render(condition) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<Harness initial={[createGroup({ conditions: [createCondition(condition)] })]} />);
  });
  return container;
}

const button = (container, label) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

async function click(element) {
  expect(element).toBeDefined();
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function type(input, value) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// jsdom has no layout, and the select scrolls its current option into view.
Element.prototype.scrollIntoView = () => {};

const options = () => [...document.querySelectorAll('[role="option"]')];
const option = (label) => options().find((o) => o.textContent.trim() === label);

async function pickField(container, current, next) {
  await click(button(container, current));
  await click(option(next));
}

const condition = () => seen.groups[0].conditions[0];

afterEach(async () => {
  await act(async () => {
    mounted.root.unmount();
  });
  mounted.container.remove();
});

describe("FilterBuilder", () => {
  it("offers none of the removed operators", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await click(button(container, "at least"));
    const labels = options().map((o) => o.textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(["at most", "exactly", "between"]));
    expect(labels).not.toContain("≠");
    await click(option("at least"));
  });

  it("keeps the operator select at its own width beside the field", async () => {
    const container = await render({ field: "playcount", value: 3 });
    const operator = container.querySelector('[aria-label="Filter operator"]');
    expect(operator.classList.contains("w-40")).toBe(true);
    expect(operator.classList.contains("w-full")).toBe(false);
  });

  it("starts a loved filter on Loved with no operator to choose", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await pickField(container, "Your plays (window)", "Loved or not");
    expect(condition()).toMatchObject({ field: "userloved", operator: "is", value: true });
    expect(button(container, "is")).toBeUndefined();
    await click(button(container, "Not loved"));
    expect(condition().value).toBe(false);
  });

  it("forgets the typed tag when switching field, and suggests the catalogue's tags", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await pickField(container, "Your plays (window)", "Tag");
    expect(condition()).toMatchObject({ field: "tags", operator: "contains", value: "" });
    const input = container.querySelector('input[type="text"]');
    expect(input.value).toBe("");

    await type(input, "ra");
    expect(container.textContent).toContain("120 artists");
    expect(container.textContent).toContain("1 artist");
    await click([...container.querySelectorAll("button")].find((b) => b.textContent.startsWith("rap")));
    expect(condition().value).toBe("rap");
  });

  it("empties the condition when the tag box is emptied", async () => {
    const container = await render({ field: "tags", operator: "contains", value: "rap" });
    await type(container.querySelector('input[type="text"]'), "");
    expect(condition().value).toBe("");
  });

  it("folds groups away until Advanced, and offers no sub-group inside a sub-group", async () => {
    const container = await render({ field: "playcount", value: 3 });
    expect(button(container, "Add sub-group")).toBeUndefined();
    await click(button(container, "Advanced"));
    await click(button(container, "Add sub-group"));
    expect(seen.groups[0].groups).toHaveLength(1);
    expect([...container.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Add sub-group")).toHaveLength(1);
    expect(button(container, "Advanced")).toBeUndefined();
  });

  it("removes a rule from a button that is always there", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await click(container.querySelector('[aria-label="Remove rule"]'));
    expect(seen.groups[0].conditions).toEqual([]);
  });

  it("starts top artists on a working rank over the window", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await pickField(container, "Your plays (window)", "Top artists");
    expect(condition()).toMatchObject({ field: "artist_rank", operator: "lte", value: 10, period: null });
    await pickField(container, "in this window", "between two dates");
    expect(condition().period).toEqual({ since: expect.any(String), until: expect.any(String) });
    expect(condition().period.since < condition().period.until).toBe(true);
  });

  it("starts a listening moment on a moment the server accepts", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await pickField(container, "Your plays (window)", "Listening moment");
    expect(condition()).toMatchObject({ value: 1, moment: { fromHour: 18, toHour: 23 } });
    await pickField(container, "18:00", "Any hour");
    expect(condition().moment).toEqual({ fromDay: 1, toDay: 7, fromHour: null, toHour: null });
  });
});
