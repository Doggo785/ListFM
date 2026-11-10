// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteAutomation,
  getAutomation,
  getAutomationHistory,
  retryRun,
  runAutomationNow,
  updateAutomation,
} from "@/lib/api";
import Automation from "./Automation";

vi.mock("@/lib/api", () => ({
  deleteAutomation: vi.fn(),
  getAutomation: vi.fn(),
  getAutomationHistory: vi.fn(),
  getRunProgress: vi.fn(async () => ({ stage: "filter", done: 2, total: 8 })),
  newProgressToken: () => "token",
  pollProgress: vi.fn(async (getSnapshot, { onUpdate }) => onUpdate(await getSnapshot())),
  retryRun: vi.fn(),
  runAutomationNow: vi.fn(),
  updateAutomation: vi.fn(),
}));
const auth = vi.hoisted(() => ({ user: { lastfm_username: "doggo" } }));
const sync = vi.hoisted(() => ({ value: { complete: true } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useAutomations", () => ({ useAutomations: () => ({ generatedPlaylists: [] }) }));
vi.mock("@/hooks/useScrobbleSync", () => ({ useScrobbleSync: () => sync.value }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const AUTOMATION = { id: "a1", name: "Seasonal", cron: "0 8 * * *", enabled: true, sort: "most_played", window: { length: { amount: 3, unit: "month" } } };
const today = new Date().toISOString();
const run = (over) => ({ id: "r1", automation_id: "a1", status: "completed", attempt: 1, scheduled_for: today, started_at: today, tracks_generated: 50, target_size: 50, ...over });

let host;
let root;

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}|{location.state?.notice ?? ""}</output>;
}

async function show(state) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[{ pathname: "/automations/a1", state }]}>
        <Where />
        <Routes>
          <Route path="/automations/:id" element={<Automation />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

const button = (label) => [...host.querySelectorAll("button")].find((el) => el.textContent.trim() === label);
const click = (el) => act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const text = () => host.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  HTMLCanvasElement.prototype.getContext = () => null;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  auth.user = { lastfm_username: "doggo" };
  sync.value = { complete: true };
  getAutomation.mockResolvedValue(AUTOMATION);
  getAutomationHistory.mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("Automation history", () => {
  it("says when nothing has run yet", async () => {
    await show();
    expect(text()).toContain("No runs yet");
    expect(text()).toContain("First playlist on the next date.");
  });

  it("opens a finished run's playlist and states a short run", async () => {
    getAutomationHistory.mockResolvedValue([run({ tracks_generated: 32, generated_playlist_id: "p1" })]);
    await show();
    const link = host.querySelector('a[href="/playlists/p1"]');
    expect(link.textContent).toContain("32/50 tracks");
    expect(text()).toContain("Today");
    expect(button("Re-run")).toBeUndefined();
  });

  it("keeps an empty run neutral, with no alarm on the ribbon", async () => {
    getAutomationHistory.mockResolvedValue([run({ status: "empty", tracks_generated: 0 })]);
    await show();
    expect(text()).toContain("Empty · No track matched");
    expect(host.querySelector("[data-ribbon-hot]")).toBeNull();
  });

  it("folds a run's attempts in one line and offers Re-run on the latest only", async () => {
    getAutomationHistory.mockResolvedValue([
      run({ id: "r3", status: "failed", attempt: 2, scheduled_for: "2026-06-01T00:00:00Z", error_message: "Last.fm is rate limiting requests.", retries_exhausted: false }),
      run({ id: "r2", status: "failed", attempt: 1, scheduled_for: "2026-06-01T00:00:00Z", error_message: "First reason" }),
      run({ id: "r1", status: "failed", attempt: 1, scheduled_for: "2026-05-01T00:00:00Z" }),
    ]);
    await show();
    expect(text()).toContain("Failed after 2 tries");
    expect(text()).toContain("2 tries");
    expect(text()).toContain("First reason");
    expect([...host.querySelectorAll("button")].filter((el) => el.textContent === "Re-run")).toHaveLength(1);
    expect(host.querySelector("[data-ribbon-hot]")).not.toBeNull();
  });

  it("retries through the retry route and shows Running on the same line", async () => {
    let finish;
    retryRun.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    getAutomationHistory.mockResolvedValue([run({ status: "failed", next_retry_at: "2999-01-01T14:32:00" })]);
    await show();
    expect(text()).toContain("Retrying at");

    await click(button("Re-run"));
    expect(retryRun).toHaveBeenCalledWith("a1", "r1", "token");
    expect(runAutomationNow).not.toHaveBeenCalled();
    expect(text()).toContain("Running");
    expect(text()).toContain("Applying filters · 2 of 8 tracks");
    expect(host.querySelectorAll("li").length).toBe(1);
    expect(host.querySelector("[data-ribbon-hot]")).toBeNull();

    getAutomationHistory.mockResolvedValue([run({ id: "r2", attempt: 2, tracks_generated: 50 }), run({ status: "failed" })]);
    await act(async () => finish(run({})));
    expect(text()).toContain("50 tracks · On try 2");
  });

  it("shows a failed history load and tries again", async () => {
    getAutomationHistory.mockRejectedValueOnce(new Error("API 500: boom"));
    await show();
    expect(text()).toContain("The history could not load.");
    await click(button("Try again"));
    expect(text()).toContain("No runs yet");
  });
});

describe("Automation actions", () => {
  it("runs from a new line on top, and says why a run was refused", async () => {
    let finish;
    runAutomationNow.mockImplementation(() => new Promise((_, reject) => { finish = reject; }));
    await show();
    await click(button("Run now"));
    expect(runAutomationNow).toHaveBeenCalledWith("a1", "token");
    expect(button("Running").disabled).toBe(true);
    expect(text()).toContain("Running");
    await act(async () => finish(new Error("API 409: A run is already in progress")));
    expect(host.querySelector('[role="alert"]').textContent).toBe("A run is already in progress");
    expect(button("Run now").disabled).toBe(false);
  });

  it("runs once on arrival from the Creator and clears what it was sent", async () => {
    runAutomationNow.mockResolvedValue(run({}));
    await show({ notice: "Saved.", runNow: true });
    expect(runAutomationNow).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Saved.");
    expect(host.querySelector('[data-testid="where"]').textContent).toBe("/automations/a1|");
  });

  it("runs during the first import too: the run waits, and says for how long", async () => {
    sync.value = { complete: false, stage: "sync", eta_seconds: 720 };
    const started = new Date().toISOString();
    getAutomationHistory.mockResolvedValue([{
      id: "h1", status: "waiting", attempt: 1, started_at: started, scheduled_for: started,
      error_message: "Your listening history is still loading.",
    }]);
    await show();
    expect(button("Run now").disabled).toBe(false);
    expect(text()).toContain("Waiting");
    expect(text()).toContain("Your listening history is still loading. It starts by itself, about 12 min left.");
  });

  it("pauses and resumes", async () => {
    updateAutomation.mockResolvedValue({ ...AUTOMATION, enabled: false });
    await show();
    await click(button("Pause"));
    expect(updateAutomation).toHaveBeenCalledWith("a1", { enabled: false });
    expect(button("Resume")).toBeDefined();
    expect(text()).toContain("Paused");

    updateAutomation.mockRejectedValue(new Error("API 500: nope"));
    await click(button("Resume"));
    expect(host.querySelector('[role="alert"]').textContent).toBe("nope");
  });

  it("edits through the Creator's page", async () => {
    await show();
    expect(host.querySelector('a[href="/automations/a1/edit"]').textContent).toBe("Edit");
  });

  it("asks before deleting, and says when it failed", async () => {
    await show();
    await click(button("Delete"));
    deleteAutomation.mockRejectedValueOnce(new Error("API 500: nope"));
    const dialog = () => [...document.querySelectorAll('[role="dialog"] button')];
    await click(dialog().find((el) => el.textContent === "Delete"));
    expect(host.querySelector('[role="alert"]').textContent).toBe("nope");

    deleteAutomation.mockResolvedValue(null);
    await click(button("Delete"));
    await click(dialog().find((el) => el.textContent === "Delete"));
    expect(deleteAutomation).toHaveBeenCalledWith("a1");
    expect(host.querySelector('[data-testid="where"]').textContent).toBe("/automations|");
  });
});

describe("Automation loading", () => {
  it("says when the automation is gone", async () => {
    getAutomation.mockRejectedValue(new Error("API 404: Not found"));
    await show();
    expect(text()).toContain("This automation no longer exists");
  });

  it("offers another try when it could not load", async () => {
    getAutomation.mockRejectedValueOnce(new Error("API 500: boom"));
    await show();
    expect(text()).toContain("This automation could not load.");
    await click(button("Try again"));
    expect(text()).toContain("Seasonal");
  });

  it("asks to link an account first", async () => {
    auth.user = {};
    await show();
    expect(text()).toContain("Link your Last.fm account");
  });
});
