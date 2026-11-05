// @vitest-environment jsdom
import React, { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Modal from "@/components/ui/Modal";

let root;
afterEach(async () => {
  await act(async () => root.unmount());
});

async function open(onClose) {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () =>
    root.render(
      <Modal open onClose={onClose} title="Delete automation" description="This cannot be undone.">
        <button>Cancel</button>
        <button>Delete</button>
      </Modal>,
    ),
  );
  return document.querySelector('[role="dialog"]');
}

describe("Modal", () => {
  it("gives focus back to what opened it", async () => {
    const opener = document.body.appendChild(document.createElement("button"));
    opener.focus();
    await open(vi.fn());
    expect(document.activeElement).not.toBe(opener);
    await act(async () => root.render(<Modal open={false} onClose={vi.fn()} title="t" description="d" />));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });


  it("names itself and starts focus on the first action", async () => {
    const dialog = await open(vi.fn());
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")).textContent).toBe("Delete automation");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")).textContent).toBe("This cannot be undone.");
    expect(document.activeElement.textContent).toBe("Cancel");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const dialog = await open(onClose);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
