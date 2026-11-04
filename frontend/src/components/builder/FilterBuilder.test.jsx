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

async function pickField(container, current, next) {
  await click(button(container, current));
  await click(button(container, next));
}

const condition = () => seen.groups[0].conditions[0];

afterEach(async () => {
  await act(async () => {
    mounted.root.unmount();
  });
  mounted.container.remove();
});

describe("FilterBuilder", () => {
  it("offers neither rank nor the removed operators", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await click(button(container, "at least"));
    const labels = [...container.querySelectorAll("button")].map((b) => b.textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(["at most", "exactly", "between"]));
    expect(labels).not.toContain("≠");
    await click(button(container, "Your plays (window)"));
    expect(container.textContent).not.toContain("Rank");
  });

  it("starts a loved filter on Loved with no operator to choose", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await pickField(container, "Your plays (window)", "Loved");
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

  it("does not offer a sub-group inside a sub-group", async () => {
    const container = await render({ field: "playcount", value: 3 });
    await click(button(container, "Add"));
    await click(button(container, "Add sub-group"));
    const addButtons = [...container.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Add");
    await click(addButtons[0]);
    expect(button(container, "Add condition")).toBeDefined();
    expect(button(container, "Add sub-group")).toBeUndefined();
  });
});
