import { useAuth } from "@/contexts/AuthContext";
import { useScrobbleSync } from "@/hooks/useScrobbleSync";
import { startScrobbleSync } from "@/lib/api";

// Below this a tag pass is routine: it ends in moments and changes nothing the person would notice.
const MIN_VISIBLE_TAG_PASS = 50;

function currentTask(status) {
  if (!status) return null;
  if (!status.complete) {
    if (status.error) return { note: status.error };
    const percent = status.total ? Math.round((status.done / status.total) * 100) : 0;
    return {
      progress: `Loading your listening history: ${percent}%`,
      note: "Previews only see part of it, and runs wait until it finishes.",
      share: percent,
    };
  }
  if (status.tags_total >= MIN_VISIBLE_TAG_PASS) {
    const count = (n) => n.toLocaleString("en-US");
    return {
      progress: `Looking up tags: ${count(status.tags_done)} / ${count(status.tags_total)} artists`,
      note: "Tag filters can be incomplete until then.",
      share: Math.round((status.tags_done / status.tags_total) * 100),
    };
  }
  return null;
}

/** The background work that can change results, visible on every page until it ends. */
export default function BackgroundTasks() {
  const { user } = useAuth();
  // Also keeps a finished history fresh: the server skips it if synced in the last 10 minutes.
  const status = useScrobbleSync(Boolean(user?.lastfm_username), startScrobbleSync);
  const task = currentTask(status);
  if (!task) return null;

  return (
    <div className="background-task page-enter text-xs" data-quiet>
      <p>
        {task.progress && <span className="text-(--text)">{task.progress}. </span>}
        {/* Only this part is announced: reading the counter aloud every few seconds would be noise. */}
        <span role="status">{task.note}</span>
      </p>
      {task.progress && (
        <div className="background-task__track" aria-hidden="true">
          <div className="background-task__fill" style={{ width: `${task.share}%` }} />
        </div>
      )}
    </div>
  );
}
