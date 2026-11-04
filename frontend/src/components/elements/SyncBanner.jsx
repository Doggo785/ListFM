import { useAuth } from "@/contexts/AuthContext";
import { useScrobbleSync } from "@/hooks/useScrobbleSync";
import { startScrobbleSync } from "@/lib/api";

/** Shows the first listening history load, the only time runs must wait (ADR 0001). */
export default function SyncBanner() {
  const { user } = useAuth();
  // Also keeps a finished history fresh: the server skips it if synced in the last 10 minutes.
  const status = useScrobbleSync(Boolean(user?.lastfm_username), startScrobbleSync);

  if (!status || status.complete) return null;
  const percent = status.total ? Math.round((status.done / status.total) * 100) : 0;
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-neutral-700 bg-[#1c1c1c] px-4 py-3 text-sm text-neutral-300 shadow-lg"
    >
      {status.error ? (
        <span>{status.error}</span>
      ) : (
        <>
          <span className="font-semibold text-white">Loading your listening history… {percent}%</span>{" "}
          Previews only see part of it, and runs wait until it finishes.
          <div className="mt-2 h-1 overflow-hidden rounded bg-neutral-800">
            <div className="h-full bg-[#ff530b] transition-all" style={{ width: `${percent}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
