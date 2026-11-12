import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAutomations } from "@/hooks/useAutomations";
import { buttonVariants } from "@/components/ui/buttonVariants";
import PlaylistCover from "@/components/ui/PlaylistCover";
import Loader from "@/components/elements/Loader";
import { LinkLastfmHint, LoadFailed } from "@/components/elements/PageStates";
import { glide, glideArrived } from "@/lib/glide";
import { describeCoverage, plural, shelvesOf } from "@/lib/playlists";
import { FOCUS } from "@/lib/utils";
import { LastfmCredit } from "@/components/ui/Lastfm";


// Browser Back carries no state: this is how the shelves still find the playlist that was open.
let lastOpened = null;

function Shelf({ shelf, opening, cameFrom, returnTo, onOpen }) {
  const heading = useId();
  const open = shelf.playlists.some((playlist) => playlist.id === opening);
  return (
    <section data-quiet aria-labelledby={heading} className="w-fit max-w-full min-w-0 pb-8">
      <div className="flex flex-wrap items-baseline gap-x-4 pb-3">
        <h2 id={heading} className="w-fit text-2xl" style={open ? { viewTransitionName: "playlist-title" } : undefined}>{shelf.name}</h2>
        {shelf.cadence && <p className="text-sm text-(--text-muted)">{shelf.cadence}</p>}
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-color:var(--control)_transparent] md:-mx-8 md:scroll-px-8 md:gap-6 md:px-8">
        {shelf.playlists.map((playlist) => {
          const active = playlist.id === opening;
          return (
            <li key={playlist.id} className="w-[128px] shrink-0 snap-start md:w-[192px]">
              <Link
                to={`/playlists/${playlist.id}`}
                ref={playlist.id === cameFrom ? returnTo : undefined}
                onClick={(event) => onOpen(event, playlist)}
                className={`group block ${FOCUS}`}
              >
                <PlaylistCover
                  seed={playlist.id}
                  images={playlist.cover_images}
                  className="w-full outline-2 outline-transparent transition-[outline-color] duration-(--duration-quick) group-hover:outline-(--ember)"
                  style={active ? { viewTransitionName: "playlist-cover" } : undefined}
                />
                <span className="block w-fit pt-2 text-sm group-hover:text-(--ember)" style={active ? { viewTransitionName: "playlist-period" } : undefined}>
                  {describeCoverage(playlist)}
                </span>
                <span className="block text-xs text-(--text-muted)">{plural(playlist.track_count, "track")}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Playlists() {
  const { user } = useAuth();
  const username = user?.lastfm_username;
  const navigate = useNavigate();
  const location = useLocation();
  const { automations, generatedPlaylists, isLoading, error, playlistsFailed, refetch } = useAutomations(username);
  const navigationType = useNavigationType();
  const cameFrom = location.state?.from ?? (navigationType === "POP" ? lastOpened : null);
  const returned = useRef(false);
  // Once only: the list refreshes behind the page and must not pull the shelf back.
  const returnTo = useCallback((node) => {
    if (!node || returned.current) return;
    returned.current = true;
    node.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    node.focus({ preventScroll: true });
  }, []);
  const [opening, setOpening] = useState(cameFrom ?? null);
  const shelves = useMemo(() => shelvesOf(generatedPlaylists, automations), [generatedPlaylists, automations]);

  useLayoutEffect(() => glideArrived(), []);

  useEffect(() => {
    document.title = "Playlists - ListFM";
  }, []);

  const openPlaylist = (event, playlist) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    lastOpened = playlist.id;
    // Named before the browser's first picture: only the opened playlist glides.
    flushSync(() => setOpening(playlist.id));
    glide(() => navigate(`/playlists/${playlist.id}`, { state: { playlist } }));
  };

  const failed = error || playlistsFailed;
  const empty = !isLoading && !failed && shelves.length === 0;

  return (
    <main className="scroll-edge h-full w-full min-w-0 flex-1 overflow-y-auto px-4 pb-8 text-left md:px-8">
      <div className="mx-auto max-w-6xl">
        <header data-quiet className="w-fit pt-4 pb-8">
          <h1 className="text-4xl">Playlists</h1>
          {shelves.length > 0 && (
            <p className="pt-1 text-base text-(--text-muted)">
              {plural(generatedPlaylists.length, "playlist")}
            </p>
          )}
        </header>

        {!username && <LinkLastfmHint purpose="to get playlists." />}
        {username && isLoading && <Loader />}
        {username && failed && !isLoading && <LoadFailed subject="Your playlists" onRetry={refetch} />}
        {username && empty && (
          <div data-quiet>
            <p className="text-2xl">Nothing here yet</p>
            <p className="pt-1 pb-4 text-base text-(--text-muted)">
              {automations.length > 0
                ? "Each run of an automation leaves a playlist here. Start one, or wait for its next date."
                : "An automation makes your playlists. Create the first one."}
            </p>
            <Link to={automations.length > 0 ? "/automations" : "/automations/new"} className={buttonVariants()}>
              {automations.length > 0 ? "See your automations" : "Create an automation"}
            </Link>
          </div>
        )}
        {!failed && shelves.map((shelf) => (
          <Shelf key={shelf.key} shelf={shelf} opening={opening} cameFrom={cameFrom} returnTo={returnTo} onOpen={openPlaylist} />
        ))}
        {!failed && shelves.length > 0 && <LastfmCredit className="w-fit pt-8" />}
      </div>
    </main>
  );
}
