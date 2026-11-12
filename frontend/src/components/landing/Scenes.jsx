import AlbumArt from "@/components/dashboard/AlbumArt";
import PixelNumber from "@/components/elements/PixelNumber";
import { LastfmLink } from "@/components/ui/Lastfm";
import PlaylistCover from "@/components/ui/PlaylistCover";
import { timelineTicks } from "@/lib/landing/story";
import { plural } from "@/lib/playlists";

const STAGES = ["Window", "Filters", "Sort", "Limit"];
const CLAUSES = ["The same month, a year ago.", "Played at least 3 times.", "Most played first.", "Keep 50."];
const RUNS_SHOWN = 3;
const OWNER = "https://github.com/Doggo785";

const number = (n) => n.toLocaleString("en-US");

function Ticks({ demo, walker }) {
  return (
    <div data-show="ticks" className="landing__ticks" aria-hidden="true">
      {walker && <span data-show="marker" className="landing__marker">Today</span>}
      {timelineTicks(demo.first, demo.weeks).map(({ label, share }) => (
        <span key={label} className="landing__tick" style={{ left: `${share * 100}%` }}>{label}</span>
      ))}
    </div>
  );
}

export function TrackList({ tracks }) {
  return (
    <ol>
      {tracks.map((track, i) => (
        <li key={`${track.artist}|${track.title}`} className="flex items-baseline justify-between gap-4 border-t border-(--line) py-1">
          <span className="min-w-0 truncate">
            <span className="pr-2 text-(--ember)">{i + 1}</span>
            <LastfmLink artist={track.artist}>{track.artist}</LastfmLink> - <LastfmLink artist={track.artist} track={track.title}>{track.title}</LastfmLink>
          </span>
          <span className="shrink-0 text-(--text-muted)">{plural(track.plays, "play")}</span>
        </li>
      ))}
    </ol>
  );
}

export function Listens({ demo, still }) {
  return (
    <div className="landing__scene">
      <div className="landing__head">
        <div data-quiet data-reveal className="max-w-3xl text-xl text-balance md:text-2xl">
          <p>This thread has followed <a href={OWNER} target="_blank" rel="noopener noreferrer" className="underline hover:text-(--ember)">{demo.name}</a>'s listening since {demo.since}.</p>
          <p className="text-(--text-muted)">Last.fm logs what you play across your apps.</p>
        </div>
        <p data-quiet className="landing__count">
          <span data-show="count" className="font-heading text-5xl">{still ? number(demo.total) : "0"}</span>
          <span className="pl-2 text-xl text-(--text-muted)">listens</span>
        </p>
      </div>
      <div className="landing__covers" aria-hidden="true">
        {demo.covers.map((cover) => (
          // Kept whole on screen: the first quarter starts at the very edge of the timeline.
          <div key={cover.url} data-show-cover={cover.share} className="landing__cover" style={{ left: `clamp(48px, ${cover.share * 100}%, calc(100% - 48px))` }}>
            <AlbumArt url={cover.url} seed={cover.url} eager small className="block aspect-square w-full object-cover" />
          </div>
        ))}
      </div>
      {!still && <Ticks demo={demo} />}
    </div>
  );
}

/** The recipe as a sentence and one counter per stage: they follow the squares, they don't explain them. */
export function Chain({ demo, stage, still }) {
  const tracks = demo.chain.plays.length;
  const big = [demo.total, tracks, demo.chain.kept, demo.chain.kept, demo.chain.size][stage];
  const values = [tracks, demo.chain.kept, demo.chain.kept, demo.chain.size];
  return (
    <div className="landing__scene">
      <div data-quiet className="landing__head">
        <p data-reveal className="landing__recipe">
          <span className="block pb-1 text-(--text-muted)">Tell it what you want:</span>
          {CLAUSES.map((clause, i) => {
            // The clause just applied lights up with its counter: the show holds there, so cause and result read together.
            const current = !still && i === stage - 1;
            return <span key={clause} className={`block ${current ? "text-(--ember)" : i < stage - 1 ? "text-(--text)" : "text-(--text-muted)"}`}>{clause}</span>;
          })}
        </p>
        <p className="landing__count">
          <span className="font-heading text-5xl"><PixelNumber value={big} /></span>
          <span className="pl-2 text-xl text-(--text-muted)">{stage === 0 ? "listens" : "tracks"}</span>
        </p>
      </div>
      {!still && <Ticks demo={demo} walker />}
      <ol data-quiet data-reveal className="landing__stages">
        {STAGES.map((name, i) => (
          <li key={name} className={stage > i ? "text-(--text)" : "text-(--text-muted)"}>
            <span className="block text-sm">{name}</span>
            <span className="block font-heading text-2xl">{stage > i ? number(values[i]) : "-"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Delivered({ demo }) {
  const { chain } = demo;
  return (
    <div className="landing__scene landing__delivered">
      <div data-show="delivered-cover" data-quiet className="landing__made">
        <PlaylistCover seed={chain.start} images={chain.covers} className="w-full" />
      </div>
      <div data-show="delivered-list" data-quiet className="min-w-0 flex-1 text-base">
        <p className="pb-2 text-xl text-pretty">{chain.label}, as {demo.name} lived it. {chain.size} tracks.</p>
        <TrackList tracks={chain.top} />
      </div>
    </div>
  );
}

export function Keeps({ demo, run, still }) {
  const shown = still ? demo.runs.length - 1 : run ?? 0;
  return (
    <div className="landing__scene landing__keeps">
      <div className="landing__head">
        <p data-quiet data-reveal className="font-heading text-4xl">Then it keeps going.<br />Nobody pressed anything.</p>
        <p data-quiet className="landing__count">
          <span className="font-heading text-5xl">{demo.runs[shown].at}</span>
          <span className="pl-2 text-xl text-(--text-muted)">00:00</span>
        </p>
      </div>
      <div data-show="keeps-line" className="landing__keeps-line" aria-hidden="true" />
      <ul data-quiet className="landing__shelf">
        <li>
          <PlaylistCover seed={demo.chain.start} images={demo.chain.covers} className="w-full" />
          <p className="truncate pt-1 text-xs text-(--text-muted)">{demo.chain.label}</p>
        </li>
        {demo.runs.map((entry, i) => (
          <li key={entry.period} data-show-slot={i}>
            <PlaylistCover seed={entry.period} images={entry.covers} className="w-full" />
            <p className="truncate pt-1 text-xs text-(--text-muted)">{entry.period}</p>
          </li>
        ))}
      </ul>
      <ul data-quiet className="landing__runs text-sm">
        {demo.runs.slice(Math.max(0, shown - RUNS_SHOWN + 1), shown + 1).map((entry) => (
          <li key={entry.at} className="flex justify-between gap-4 border-t border-(--line) py-1">
            <span>{entry.at}, 00:00</span>
            <span className="text-(--text-muted)">{entry.size} tracks, {entry.period}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Obeys({ demo, recipe, still }) {
  const list = still ? demo.recipes : [demo.recipes[recipe ?? 0]];
  return (
    <div className="landing__scene landing__obeys">
      <p data-quiet data-reveal className="font-heading text-4xl">Anything you can describe.</p>
      {list.map((entry) => (
        <div key={entry.name} data-quiet className="landing__recipe-card">
          <p className="text-xl text-(--ember)">{entry.name}</p>
          <p className="pb-2 text-xl text-pretty">{entry.sentence} <span className="text-(--text-muted)">{entry.size} tracks out of {number(entry.of)}.</span></p>
          <TrackList tracks={entry.top} />
        </div>
      ))}
      <p data-quiet className="landing__also text-base text-(--text-muted)">Tags, loved tracks, play counts, first listens and top artists too, with rules that must all match, or any one of them. Everything stays folded until you go looking for it.</p>
    </div>
  );
}
