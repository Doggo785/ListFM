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
import { runAutomationNow } from "@/lib/api";
import { namePeriod } from "@/lib/automation-rules";
import { PLAYLISTS_KEPT, coverageDates, describeCoverage, plural, shelfLoad, shelvesOf } from "@/lib/playlists";
import { FOCUS } from "@/lib/utils";
import { LastfmCredit } from "@/components/ui/Lastfm";


// Browser Back carries no state: this is how the shelves still find the playlist that was open.
let lastOpened = null;
const GOES_NEXT = "Goes next when a new playlist is made";
const apiMessage = (err) => (err?.message || "Failed").replace(/^API \d+: /, "");

const TILE = "w-[128px] shrink-0 snap-start md:w-[192px]";

/** A period the schedule closed and no playlist covers: "not forged yet", made on the spot. */
function MissingTile({ period, making, blocked, error, removes, onMake }) {
  const name = namePeriod(period);
  const dates = coverageDates(period);
  const busy = making || period.status === "running" || period.status === "waiting";
  const failed = !busy && (error || period.status === "failed");
  const cover = (
    <div className="outline-2 -outline-offset-2 outline-dashed outline-(--control) transition-[outline-color] duration-(--duration-quick) group-hover:outline-(--ember) group-focus-visible:outline-(--ember)">
      <PlaylistCover seed={`${period.automation_id}:${period.end}`} className="w-full opacity-25" />
    </div>
  );
  const label = (
    <>
      <span className="block w-fit pt-2 text-sm text-(--text-muted) group-hover:text-(--ember)">{name}</span>
      {dates && <span className="block text-xs text-(--text-muted)">{dates}</span>}
    </>
  );
  if (busy) {
    return (
      <li className={TILE} data-loader="">
        {cover}
        {label}
        <span role="status" className="block text-xs">Making…</span>
      </li>
    );
  }
  if (period.status === "empty" && !error) {
    return (
      <li className={TILE}>
        {cover}
        {label}
        <span className="block text-xs text-(--text-muted)">No track matched</span>
      </li>
    );
  }
  return (
    <li className={TILE}>
      <button type="button" onClick={onMake} disabled={blocked} aria-label={`Make ${name}`} className={`group block w-full cursor-pointer text-left disabled:cursor-default ${FOCUS}`}>
        {cover}
        {label}
        {failed ? (
          <span className="block text-xs text-(--ember)">{typeof error === "string" ? error : "Failed"} · Try again</span>
        ) : (
          <span className="block text-xs text-(--ember)">Make it</span>
        )}
        {removes && <span className="block text-xs text-(--text-muted)">Removes {removes}</span>}
      </button>
    </li>
  );
}

function Shelf({ shelf, opening, cameFrom, returnTo, onOpen, making, onMake, focused }) {
  const heading = useId();
  const open = shelf.playlists.some((playlist) => playlist.id === opening);
  const { warning, burn } = shelfLoad(shelf.playlists.length);
  const full = shelf.playlists.length >= PLAYLISTS_KEPT;
  const busy = [...making.keys()].some((key) => key.startsWith(`${shelf.key}|`) && making.get(key) === true);
  return (
    <section data-quiet aria-labelledby={heading} ref={focused} className="w-fit max-w-full min-w-0 pb-8">
      <div className="flex flex-wrap items-baseline gap-x-4 pb-3">
        <h2 id={heading} className="w-fit text-2xl" style={open ? { viewTransitionName: "playlist-title" } : undefined}>{shelf.name}</h2>
        {shelf.cadence && <p className="text-sm text-(--text-muted)">{shelf.cadence}</p>}
        {warning && <p className="w-full text-sm text-(--ember)">{warning}</p>}
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-color:var(--control)_transparent] md:-mx-8 md:scroll-px-8 md:gap-6 md:px-8">
        {shelf.items.map((item) => {
          if (item.as_of) {
            const key = `${shelf.key}|${item.as_of}`;
            return (
              <MissingTile
                key={key}
                period={item}
                making={making.get(key) === true}
                error={making.get(key) !== true && making.get(key)}
                // One run at a time per automation: the server would refuse a second one.
                blocked={busy}
                removes={full && shelf.oldest ? describeCoverage(shelf.oldest) : null}
                onMake={() => onMake(item, key)}
              />
            );
          }
          const playlist = item;
          const active = playlist.id === opening;
          const goesNext = burn > 0 && playlist === shelf.oldest;
          const dates = coverageDates({ start: playlist.period_start, end: playlist.period_end });
          return (
            <li key={playlist.id} className={TILE}>
              <Link
                to={`/playlists/${playlist.id}`}
                ref={playlist.id === cameFrom ? returnTo : undefined}
                onClick={(event) => onOpen(event, playlist)}
                title={goesNext ? GOES_NEXT : undefined}
                className={`group block ${FOCUS}`}
              >
                <PlaylistCover
                  seed={playlist.id}
                  images={playlist.cover_images}
                  burn={goesNext ? burn : 0}
                  className="w-full outline-2 outline-transparent transition-[outline-color] duration-(--duration-quick) group-hover:outline-(--ember)"
                  style={active ? { viewTransitionName: "playlist-cover" } : undefined}
                />
                <span className="block w-fit pt-2 text-sm group-hover:text-(--ember)" style={active ? { viewTransitionName: "playlist-period" } : undefined}>
                  {describeCoverage(playlist)}
                </span>
                {dates && <span className="block text-xs text-(--text-muted)">{dates}</span>}
                <span className="block text-xs text-(--text-muted)">{plural(playlist.track_count, "track")}</span>
                {goesNext && <span className="sr-only">{GOES_NEXT}</span>}
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
  const { automations, generatedPlaylists, pastPeriods, isLoading, error, playlistsFailed, refetch } = useAutomations(username);
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
  const shelves = useMemo(() => shelvesOf(generatedPlaylists, automations, pastPeriods), [generatedPlaylists, automations, pastPeriods]);
  // Missing periods being made (true) or refused (the reason), by automation|as_of.
  const [making, setMaking] = useState(() => new Map());
  const setOne = (key, value) => setMaking((current) => {
    const next = new Map(current);
    if (value === undefined) next.delete(key);
    else next.set(key, value);
    return next;
  });
  const make = async (period, key) => {
    setOne(key, true);
    try {
      await runAutomationNow(period.automation_id, undefined, period.as_of);
      await refetch();
      setOne(key, undefined);
    } catch (err) {
      setOne(key, apiMessage(err));
    }
  };
  // Sent from an automation's page: its shelf comes into view once.
  const shelfWanted = location.state?.shelf;
  const focused = useCallback((node) => node?.scrollIntoView?.({ block: "start" }), []);

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
          <Shelf
            key={shelf.key}
            shelf={shelf}
            opening={opening}
            cameFrom={cameFrom}
            returnTo={returnTo}
            onOpen={openPlaylist}
            making={making}
            onMake={make}
            focused={shelf.key === shelfWanted ? focused : undefined}
          />
        ))}
        {!failed && shelves.length > 0 && <LastfmCredit className="w-fit pt-8" />}
      </div>
    </main>
  );
}
