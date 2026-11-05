import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { forgetPlaylist, useAutomations } from "@/hooks/useAutomations";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import DeleteAction from "@/components/ui/DeleteAction";
import PlaylistCover from "@/components/ui/PlaylistCover";
import Loader from "@/components/elements/Loader";
import { Gone, LoadFailed, StatePage } from "@/components/elements/PageStates";
import { deleteGeneratedPlaylist, getGeneratedPlaylistTracks } from "@/lib/api";
import { glide, glideArrived } from "@/lib/glide";
import { describeCoverage, describeMade, plural, tracksAsText } from "@/lib/playlists";
import { FOCUS } from "@/lib/utils";

const COPIED_MS = 2000;

/** navigator.clipboard only exists on HTTPS and localhost, and the site may run on plain HTTP. */
async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.body.appendChild(document.createElement("textarea"));
  area.value = text;
  try {
    area.select();
    if (!document.execCommand("copy")) throw new Error("copy refused");
  } finally {
    area.remove();
  }
}

/** One copy button: says what happened, then goes back to its label. */
function CopyList({ tracks }) {
  const [said, setSaid] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await copyText(tracksAsText(tracks));
      setSaid("Copied");
    } catch {
      setSaid("Couldn't copy");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(null), COPIED_MS);
  };

  return (
    <>
      <Button variant="outline" onClick={copy} disabled={!tracks?.length}>{said ?? "Copy list"}</Button>
      <span role="status" className="sr-only">{said}</span>
    </>
  );
}

function Tracks({ tracks, failed, onRetry }) {
  if (failed) {
    return (
      <div role="alert">
        <p className="pb-3 text-base">The tracks could not load.</p>
        <Button variant="outline" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  if (!tracks) return <p role="status" className="text-sm text-(--text-muted)">Loading tracks</p>;
  if (tracks.length === 0) return <p className="text-base text-(--text-muted)">No tracks in this playlist.</p>;
  return (
    <>
    <p className="pb-2 text-sm text-(--text-muted)">Each track opens on Last.fm.</p>
    <ol className="divide-y divide-(--line)">
      {tracks.map((track, i) => (
        <li key={track.position} className="preview-row" style={{ "--row": Math.min(i, 14) }}>
          <a
            href={`https://www.last.fm/music/${encodeURIComponent(track.artist)}/_/${encodeURIComponent(track.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 py-2 pr-2 outline-none transition-colors duration-(--duration-quick) hover:bg-(--ember-1) focus-visible:bg-(--ember-1) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ember-9)"
          >
            <span className="w-8 shrink-0 text-right text-sm text-(--text-muted) tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base">{track.title}</span>
              <span className="block truncate text-sm text-(--text-muted)">{track.artist}</span>
            </span>
            <span className="sr-only">, opens on Last.fm in a new tab</span>
          </a>
        </li>
      ))}
    </ol>
    </>
  );
}

export default function Playlist() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { automations, generatedPlaylists, isLoading, error, playlistsFailed, refetch } = useAutomations(user?.lastfm_username);
  const playlist = generatedPlaylists.find((candidate) => candidate.id === id) ?? location.state?.playlist;
  const automation = automations.find((candidate) => candidate.id === playlist?.automation_id);

  const [tracks, setTracks] = useState(null);
  const [tracksFailed, setTracksFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const title = useRef(null);
  const hasPlaylist = Boolean(playlist);

  useLayoutEffect(() => glideArrived(), []);

  useEffect(() => {
    if (hasPlaylist) title.current?.focus({ preventScroll: true });
  }, [hasPlaylist]);

  useEffect(() => {
    if (playlist?.name) document.title = `${playlist.name} - ListFM`;
  }, [playlist?.name]);

  useEffect(() => {
    let current = true;
    setTracks(null);
    setTracksFailed(false);
    getGeneratedPlaylistTracks(id)
      .then((list) => current && setTracks(list))
      .catch(() => current && setTracksFailed(true));
    return () => {
      current = false;
    };
  }, [id, attempt]);

  const backToShelf = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    glide(() => navigate("/playlists", { state: { from: id } }));
  };

  if (!playlist) {
    if (isLoading) return <StatePage><Loader /></StatePage>;
    if (error || playlistsFailed) return <StatePage><LoadFailed subject="This playlist" onRetry={refetch} /></StatePage>;
    // This address used to be an automation's page: old links still arrive there.
    if (automations.some((candidate) => candidate.id === id)) return <Navigate to={`/automations/${id}`} replace />;
    return <StatePage><Gone subject="This playlist" to="/playlists" back="Back to playlists" /></StatePage>;
  }

  const name = playlist.name || "Untitled";

  return (
    <main className="scroll-edge h-full w-full min-w-0 flex-1 overflow-y-auto px-4 pb-8 text-left md:px-8">
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-6 pt-4 lg:grid-cols-[384px_minmax(0,1fr)]">
        <header data-quiet className="min-w-0 [@media(min-width:64rem)_and_(min-height:50rem)]:sticky [@media(min-width:64rem)_and_(min-height:50rem)]:top-4 lg:self-start">
          <Link to="/playlists" onClick={backToShelf} className={`inline-block pb-3 text-sm text-(--text-muted) hover:text-(--ember) pointer-coarse:py-2.5 ${FOCUS}`}>
            Back to playlists
          </Link>
          <div className="flex gap-4 lg:block">
            <PlaylistCover seed={playlist.id} images={playlist.cover_images} className="w-[128px] shrink-0 lg:w-[384px]" style={{ viewTransitionName: "playlist-cover" }} />
            <div className="min-w-0 lg:pt-4">
              <h1 ref={title} tabIndex={-1} className="w-fit max-w-full text-2xl break-words outline-none md:text-4xl" style={{ viewTransitionName: "playlist-title" }}>{name}</h1>
              <p className="w-fit pt-1 text-base" style={{ viewTransitionName: "playlist-period" }}>{describeCoverage(playlist)}</p>
              <p className="text-sm text-(--text-muted)">
                {plural(playlist.track_count, "track")}
                {playlist.period_end ? ` · ${describeMade(playlist)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-4">
            <CopyList tracks={tracks} />
            {automation && <Link to={`/automations/${automation.id}`} className={buttonVariants({ variant: "outline" })}>See automation</Link>}
            <DeleteAction
              title="Delete this playlist?"
              description={`${name}, ${describeCoverage(playlist)}, will be gone for good. Its automation keeps running.`}
              onDelete={async () => {
                setDeleteFailed(false);
                await deleteGeneratedPlaylist(id);
                forgetPlaylist(id);
                // Replaced: browser Back must not reopen what was just deleted.
                navigate("/playlists", { replace: true });
              }}
              onFailed={() => setDeleteFailed(true)}
            />
          </div>
          {deleteFailed && <p role="alert" className="pt-2 text-sm text-(--ember)">This playlist could not be deleted. Try again.</p>}
        </header>

        <section data-quiet aria-label="Tracks" className="min-w-0">
          <Tracks tracks={tracks} failed={tracksFailed} onRetry={() => setAttempt((n) => n + 1)} />
        </section>
      </div>
    </main>
  );
}
