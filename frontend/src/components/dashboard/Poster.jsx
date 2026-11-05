import { Link } from "react-router-dom";
import PixelNumber from "@/components/elements/PixelNumber";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { describeRun, dayOf, RUN_TONES, timeOf } from "@/lib/runs";
import { FOCUS } from "@/lib/utils";
import AlbumArt from "./AlbumArt";
import ForgedName from "./ForgedName";

const RUNS_SHOWN = 3;
const count = (n) => n.toLocaleString("en-US");
const listens = (n) => `${count(n)} ${n === 1 ? "listen" : "listens"}`;
const NAMES = new Intl.ListFormat("en", { type: "conjunction" });

function Lead({ moment, complete }) {
  if (!moment) {
    return <p className="poster__lead">{complete === false ? "Your listens are on their way. This page fills up as they arrive." : "No listens yet. Play something and it will show up here."}</p>;
  }
  return (
    <p className="poster__lead">
      {moment.days ? `Last ${moment.days} days: ` : "All time: "}
      <span className="text-(--ember)">{listens(moment.plays)}</span>
      {moment.runners_up.length > 0 && `, ahead of ${NAMES.format(moment.runners_up)}`}.
    </p>
  );
}

function LatestRuns({ runs, automations }) {
  if (!runs) return null;
  const latest = [...runs].sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).slice(0, RUNS_SHOWN);
  return (
    <section data-quiet aria-labelledby="latest-runs" className="min-w-0">
      <h2 id="latest-runs" className="pb-2 text-2xl">Latest runs</h2>
      {latest.length === 0 && (
        <>
          <p className="pb-3 text-base text-(--text-muted)">Nothing ran yet. An automation makes your playlists.</p>
          <Link to="/automations/new" className={buttonVariants()}>New automation</Link>
        </>
      )}
      <ul>
        {latest.map((run) => {
          const outcome = describeRun(run);
          const name = automations.find((automation) => automation.id === run.automation_id)?.name || "Untitled";
          return (
            <li key={run.id} className="border-t border-(--line)">
              <Link to={`/automations/${run.automation_id}`} className={`group flex items-baseline justify-between gap-3 py-2 ${FOCUS}`}>
                <span className="min-w-0">
                  <span className="block truncate text-base group-hover:text-(--ember)">{name}</span>
                  <span className={`block text-xs ${RUN_TONES[outcome.tone]}`}>{outcome.label}</span>
                </span>
                <span className="shrink-0 text-xs text-(--text-muted)">{dayOf(run.started_at)} · {timeOf(run.started_at)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The first screen: who you are listening to, in letters as large as they fit, with the ribbon under them. */
export default function Poster({ story, totals, runs, automations, username, lineRef, reducedMotion }) {
  const moment = story?.moment;
  return (
    <section className="poster">
      <div className="poster__name">
        <ForgedName name={moment?.artist ?? username} reducedMotion={reducedMotion} />
      </div>
      <div ref={lineRef} className="poster__line" aria-hidden="true" />
      <div className="poster__body">
        <div data-quiet className="min-w-0">
          <Lead moment={moment} complete={totals?.complete} />
          {moment?.albums.length > 0 && (
            <ul className="poster__shelf">
              {moment.albums.map((album) => (
                <li key={`${album.artist}|${album.title}`} className="poster__album">
                  <div className="poster__cover">
                    <AlbumArt url={album.cover_url} seed={album.title} eager small className="block aspect-square w-full object-cover" />
                  </div>
                  <p className="truncate pt-2 text-xs">{album.title}</p>
                  <p className="flex gap-1 text-xs text-(--text-muted)">
                    <span className="truncate">{album.artist}</span>
                    {/* The line above the shelf says what this number counts. */}
                    <span className="shrink-0">· {count(album.plays)}<span className="sr-only"> {album.plays === 1 ? "listen" : "listens"}</span></span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <LatestRuns runs={runs} automations={automations} />
      </div>
      {totals && (
        <dl data-quiet className="poster__totals">
          {[["Listens", totals.listens], ["Tracks", totals.tracks], ["Artists", totals.artists], ["Albums", totals.albums]].map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-xs text-(--text-muted)">{label}</dt>
              <dd className="font-heading text-4xl whitespace-nowrap"><PixelNumber value={value} separator="," /></dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
