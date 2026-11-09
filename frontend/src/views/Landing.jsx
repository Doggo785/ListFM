import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import ForgedName from "@/components/dashboard/ForgedName";
import { Chain, Delivered, Keeps, Listens, Obeys } from "@/components/landing/Scenes";
import YourTurn from "@/components/landing/YourTurn";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { useAuth } from "@/contexts/AuthContext";
import { forgedNames } from "@/lib/forge";
import demo from "@/lib/landing/demo.json";
import { createShow, FUSE_SECONDS } from "@/lib/landing/show";
import { createStage } from "@/lib/landing/stage";
import { SCENE_NAMES, sceneStarts, storyBeats, storyScreens } from "@/lib/landing/story";
import { loadAlbums } from "@/lib/playlistCover";

const NAME = "ListFM";
const REPOSITORY = "https://github.com/Doggo785/ListFM";
const BEATS = storyBeats(demo.runs.length, demo.recipes.length);
const STORY_SCREENS = storyScreens(BEATS);
// A scene's first beat: where the rail jumps to.
const SCENE_BEATS = sceneStarts().map((start) => BEATS.findIndex((beat) => beat > start));
const RAIL = ["Your listens", "The recipe", "The playlist", "Every month", "Any idea"];

/** Where the story is, and a way to jump to any of its scenes. On a phone, a bar that fills along the bottom instead. */
function Rail({ scene, onJump }) {
  return (
    <>
      <nav data-quiet className="landing__rail" aria-label="The story">
        <ol>
          {SCENE_NAMES.map((name, i) => (
            <li key={name}>
              <button type="button" onClick={() => onJump(i)} aria-current={scene === name ? "step" : undefined} className="landing__rail-step">
                {/* Out of the rail's box unless shown: the thread only steps around a label that's there. */}
                <span data-quiet={scene === name ? "" : undefined} className="landing__rail-label">{RAIL[i]}</span>
                <span className="landing__rail-dot" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div data-show="progress" className="landing__progress" aria-hidden="true" />
    </>
  );
}

function useShow({ still, intro, root, canvas }) {
  const show = useRef(null);
  const [lit, setLit] = useState(!intro);
  const [view, setView] = useState({ scene: "hero", step: null, story: false });

  useEffect(() => {
    if (still) return undefined;
    const stage = createStage(canvas.current);
    show.current = createShow({
      stage,
      demo,
      root: root.current,
      intro,
      onChange: (scene, step, story) => setView({ scene, step, story }),
      onLit: () => setLit(true),
    });
    let frame = 0;
    let last = performance.now();
    const tick = (now) => {
      const seconds = Math.max(0, (now - last) / 1000);
      last = now;
      stage.begin();
      show.current.frame(Math.min(seconds, 0.05));
      stage.end();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      show.current.destroy();
      stage.destroy();
      show.current = null;
    };
  }, [still, intro, root, canvas]);

  // Stable, and asking at call time: the show starts after the first render and the name's fire outlives many frames.
  const fuseHead = useCallback((seconds) => show.current?.fuseHead(seconds) ?? 0, []);
  const forgeHead = useCallback((seconds) => show.current?.forgeHead(seconds) ?? 0, []);
  const sparkAt = useCallback((x, y) => show.current?.sparkAt(x, y), []);
  const keystroke = useCallback(() => show.current?.keystroke(), []);
  const forged = useCallback(() => show.current?.forged(), []);
  const asking = useCallback((on) => show.current?.asking(on), []);
  const leap = useCallback(() => show.current?.leap(), []);
  const pointer = useCallback((event) => show.current?.pointer(event.clientX, event.clientY), []);

  return { lit, view, fuseHead, forgeHead, sparkAt, keystroke, forged, asking, leap, pointer };
}

function Page({ still }) {
  const root = useRef(null);
  const canvas = useRef(null);
  // A visitor back from Log in has seen it: the name burns once per page load, on every screen.
  const [intro] = useState(() => !still && !forgedNames.has(NAME));
  const { lit, view, fuseHead, forgeHead, sparkAt, keystroke, forged, asking, leap, pointer } = useShow({ still, intro, root, canvas });
  const scrolledIn = view.scene !== "hero";

  // Once the visitor is on the way: a cover cut by the fuse must already have its albums, and a visitor who leaves at the top costs nothing.
  useEffect(() => {
    if (!scrolledIn) return;
    for (const covers of [demo.chain.covers, ...demo.runs.map((run) => run.covers)]) loadAlbums(covers);
  }, [scrolledIn]);

  const storyAt = (share) => {
    const story = root.current.querySelector('[data-show="story"]');
    return story.offsetTop + share * (story.offsetHeight - root.current.clientHeight);
  };
  const seeHow = () => root.current.scrollTo({ top: storyAt(0), behavior: still ? "auto" : "smooth" });
  // At once, like changing page: a smooth trip would replay every step on the way.
  const jump = (i) => {
    root.current.scrollTo({ top: storyAt(SCENE_BEATS[i] / (BEATS.length - 1)) });
    leap();
  };

  return (
    <main
      ref={root}
      className={`landing ${still ? "landing--still" : ""}`}
      onPointerMove={pointer}
    >
      {!still && <canvas ref={canvas} className="landing__stage" aria-hidden="true" />}
      <nav data-show="bar" data-quiet className="landing__bar" aria-label="Account">
        <Link to="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>Log in</Link>
        <Link to="/register" className={buttonVariants({ size: "sm" })}>Create an account</Link>
      </nav>

      <section className="landing__hero">
        <div data-show="name" className="landing__name">
          <ForgedName name={NAME} quiet reducedMotion={still} relights={false} lit={lit} headX={fuseHead} sweepSeconds={FUSE_SECONDS + 0.1} onSpark={sparkAt} />
        </div>
        <div data-show="line" className="landing__line" aria-hidden="true" />
        <div data-show="promise" data-quiet className="landing__promise">
          <h2 className="font-heading text-3xl md:text-5xl">Describe a playlist once.<br />It keeps coming.</h2>
          <p className="pt-3 text-xl text-(--text-muted)">ListFM reads everything you've played on Last.fm and builds your playlists by itself, on your schedule.</p>
          <div className="flex flex-wrap gap-3 pt-5">
            <Link to="/register" className={buttonVariants({ size: "lg" })}>Create an account</Link>
            <button type="button" onClick={seeHow} className={buttonVariants({ variant: "outline", size: "lg" })}>See how it works</button>
          </div>
        </div>
      </section>

      <section data-show="story" className="landing__story" style={still ? undefined : { height: `${STORY_SCREENS * 100}vh` }}>
        <p className="sr-only">
          An example with a real history: {demo.total.toLocaleString("en-US")} listens. The recipe keeps the same month a year ago, the tracks played at least 3 times, most played first, and 50 of them. It runs again by itself on the 1st of each month.
        </p>
        <div data-show="pin" className="landing__pin">
          {(still || view.scene === "listens") && <Listens demo={demo} still={still} />}
          {(still || view.scene === "chain") && <Chain demo={demo} stage={still ? 4 : view.step ?? 0} still={still} />}
          {(still || view.scene === "delivered") && <Delivered demo={demo} />}
          {(still || view.scene === "keeps") && <Keeps demo={demo} run={view.step} still={still} />}
          {(still || view.scene === "obeys") && <Obeys demo={demo} recipe={view.step} still={still} />}
        </div>
      </section>
      {!still && view.story && <Rail scene={view.scene} onJump={jump} />}

      <YourTurn forgeHead={forgeHead} sparkAt={sparkAt} keystroke={keystroke} forged={forged} asking={asking} reducedMotion={still} />

      <section className="landing__end">
        <div data-quiet className="max-w-2xl text-xl">
          <p className="text-(--text-muted)">Your first load takes a few minutes, then it only fetches what's new.</p>
          <p className="pt-3 text-(--text-muted)">No Last.fm yet? It's free and logs what you play across your apps.</p>
        </div>
        <div className="landing__end-row">
          <div data-show="end-line" className="landing__end-line" aria-hidden="true" />
          <Link data-show="end-button" to="/register" className={buttonVariants({ size: "lg" })}>Create an account</Link>
        </div>
        <footer data-quiet className="landing__footer text-sm text-(--text-muted)">
          <a href={REPOSITORY} target="_blank" rel="noopener noreferrer" className="underline hover:text-(--ember)">ListFM is open source</a>
          <span> · ListFM isn't affiliated with Last.fm, Spotify or the other services named here.</span>
          <span> · The example is {demo.name}'s real history, as of {new Date(demo.asOf).toLocaleDateString("en-US", { month: "long", year: "numeric" })}.</span>
        </footer>
      </section>
    </main>
  );
}

/** The first thing anyone sees: the thread wakes, shows what it does with a real history, then turns to the visitor. */
export default function Landing() {
  const { isAuthenticated, loading } = useAuth();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    document.title = "ListFM: playlists from everything you've played";
  }, []);

  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Page still={Boolean(reducedMotion)} />;
}
