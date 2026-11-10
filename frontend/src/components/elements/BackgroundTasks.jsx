import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useScrobbleSync } from "@/hooks/useScrobbleSync";
import { startScrobbleSync } from "@/lib/api";
import { timeLeft, workFrom } from "@/lib/backgroundWork";
import { ribbonStage } from "@/lib/pixelRibbon";

// Below this a tag pass is routine: it ends in moments and changes nothing the person would notice.
const MIN_VISIBLE_TAG_PASS = 50;

const count = (n) => n.toLocaleString("en-US");
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function currentTask(status) {
  if (!status) return null;
  if (!status.complete) {
    if (status.error) return { note: status.error };
    const share = status.total ? status.done / status.total : 0;
    const reached = status.until ? ` up to ${MONTH.format(new Date(status.until))}` : "";
    return {
      kind: "listens",
      progress: `Importing your listens${reached}: ${Math.round(share * 100)}%`,
      left: status.total ? timeLeft(status.eta_seconds) ?? "estimating the time left" : null,
      note: "Previews only see part of them, and runs wait until it finishes.",
      share,
      eta: status.eta_seconds,
      since: status.since,
      until: status.until,
    };
  }
  if (status.tags_total >= MIN_VISIBLE_TAG_PASS) {
    return {
      kind: "tags",
      progress: `Looking up tags: ${count(status.tags_done)} / ${count(status.tags_total)} artists`,
      left: timeLeft(status.tags_eta_seconds) ?? "estimating the time left",
      note: "Tag filters can be incomplete until then.",
      share: status.tags_done / status.tags_total,
      eta: status.tags_eta_seconds,
    };
  }
  return null;
}

/** The background work that can change results, visible on every page until it ends, and drawn by the ribbon. */
export default function BackgroundTasks() {
  const { user } = useAuth();
  // Also keeps a finished history fresh: the server skips it if synced in the last 10 minutes.
  const status = useScrobbleSync(Boolean(user?.lastfm_username), startScrobbleSync);
  const task = currentTask(status);

  // The ribbon reads its front from here at every frame, and glides it between two reads.
  useEffect(() => {
    const next = currentTask(status);
    const work = ribbonStage.work;
    if (next?.kind) ribbonStage.work = workFrom(next, work, performance.now());
    // A failure just goes. A finished task reaches the end and flares: the ribbon lets it go after.
    else if (next) ribbonStage.work = null;
    else if (work && work.doneAt == null) ribbonStage.work = { ...work, doneAt: performance.now() };
  }, [status]);
  useEffect(
    () => () => {
      ribbonStage.work = null;
    },
    [],
  );

  if (!task) return null;
  return (
    <div className="background-task page-enter text-xs" data-quiet>
      <p>
        {task.progress && <span className="text-(--text)">{task.progress}{task.left && ` · ${task.left}`}. </span>}
        {/* Only this part is announced: reading the counter aloud every few seconds would be noise. */}
        <span role="status">{task.note}</span>
      </p>
      {task.progress && (
        <div className="background-task__track" aria-hidden="true">
          <div className="background-task__fill" style={{ width: `${Math.round(task.share * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
