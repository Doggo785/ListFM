// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PlaylistCover from "./PlaylistCover";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PlaylistCover", () => {
  let host;
  let root;
  const show = async (images) => {
    await act(async () => root.render(<PlaylistCover images={images} />));
    return [...host.querySelectorAll("img")];
  };

  beforeEach(() => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("makes a mosaic from four covers", async () => {
    expect(await show(["a", "b", "c", "d"])).toHaveLength(4);
  });

  it("shows the first alone when there are too few for a mosaic", async () => {
    const shown = await show(["a", "b", "c"]);
    expect(shown.map((img) => img.getAttribute("src"))).toEqual(["a"]);
  });

  it("stays an empty square until the covers arrive", async () => {
    expect(await show(undefined)).toHaveLength(0);
  });

  it("hides a cover that fails to load", async () => {
    const [img] = await show(["a"]);
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(img.style.visibility).toBe("hidden");
  });
});
