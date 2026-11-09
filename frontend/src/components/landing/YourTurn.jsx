import { useState } from "react";
import { Link } from "react-router-dom";
import ForgedName from "@/components/dashboard/ForgedName";
import { FormError } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { Input } from "@/components/ui/input";
import { getListenerGlimpse, readableError } from "@/lib/api";
import { FUSE_SECONDS } from "@/lib/landing/show";
import { plural } from "@/lib/playlists";

function Glimpse({ glimpse, reducedMotion, headX, onSpark }) {
  if (!glimpse.artist && glimpse.tracks.length === 0) {
    return <p data-quiet className="text-xl">No listens on this profile yet. Link Last.fm to the app you play music with, and the thread has something to follow.</p>;
  }
  return (
    <>
      {glimpse.artist && (
        <div data-show="turn-name" className="landing__name">
          <ForgedName name={glimpse.artist} quiet reducedMotion={reducedMotion} relights={false} headX={headX} sweepSeconds={FUSE_SECONDS} onSpark={onSpark} />
        </div>
      )}
      <div data-show="turn-line" className="landing__line" aria-hidden="true" />
      <div data-quiet className="text-base">
        {glimpse.tracks.length > 0 ? (
          <>
            <p className="pb-2 text-xl">The same month, a year ago: {glimpse.month}.</p>
            <ol>
              {glimpse.tracks.map((track, i) => (
                <li key={`${track.artist}|${track.title}`} className="flex items-baseline justify-between gap-4 border-t border-(--line) py-1">
                  <span className="min-w-0 truncate"><span className="pr-2 text-(--ember)">{i + 1}</span>{track.artist} - {track.title}</span>
                  <span className="shrink-0 text-(--text-muted)">{plural(track.plays, "play")}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-xl">A year ago, you weren't here yet.</p>
        )}
        <p className="pt-4 text-(--text-muted)">Real numbers from Last.fm. Your real playlists start when you sign up.</p>
        <Link to="/register" className={`mt-3 ${buttonVariants({ size: "lg" })}`}>Create an account</Link>
      </div>
    </>
  );
}

/** Scene 7: a visitor's own name in the fire, before any account. */
export default function YourTurn({ forgeHead, sparkAt, keystroke, forged, asking: working, reducedMotion }) {
  const [username, setUsername] = useState("");
  const [asking, setAsking] = useState(false);
  const [glimpse, setGlimpse] = useState(null);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const name = username.trim();
    if (!name || asking) return;
    setAsking(true);
    working(true);
    setError("");
    try {
      const answer = await getListenerGlimpse(name);
      setGlimpse(answer);
      forged();
    } catch (err) {
      setGlimpse(null);
      setError(readableError(err));
    } finally {
      setAsking(false);
      working(false);
    }
  };

  return (
    <section className="landing__turn">
      <form data-quiet onSubmit={submit} className="landing__ask" noValidate>
        <label htmlFor="landing-username" className="block pb-3">
          <span className="block font-heading text-4xl">Your turn.</span>
          <span className="block text-xl">What's your Last.fm username?</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="landing-username"
            className="min-w-0 flex-1"
            autoComplete="off"
            spellCheck={false}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              keystroke();
            }}
          />
          <Button type="submit" disabled={asking || !username.trim()}>{asking ? "Looking" : "Show me"}</Button>
        </div>
        <p className="pt-2 text-sm text-(--text-muted)">Public data. Nothing is saved.</p>
        <p className="text-sm text-(--text-muted)" aria-live="polite">{asking ? "Reading your listens on Last.fm. A long history takes a few seconds." : ""}</p>
        <div className="pt-2"><FormError>{error}</FormError></div>
      </form>
      {glimpse ? (
        <Glimpse glimpse={glimpse} reducedMotion={reducedMotion} headX={forgeHead} onSpark={sparkAt} />
      ) : (
        <div data-show="turn-line" className="landing__line" aria-hidden="true" />
      )}
    </section>
  );
}
