import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { useAuth } from "@/contexts/AuthContext";
import { useScrobbleSync } from "@/hooks/useScrobbleSync";
import { setGuideDone } from "@/lib/api";
import { EDITOR, EDITOR_START, STEPS, arrived, canGoOn, guide, guideContext, onRoute, useGuide } from "@/lib/guide";

const PAD = 8; // Pixels between what is shown and its frame.
const GAP = 14; // Between the frame and the bubble, room for the arrow.
const EDGE = 16;
const PHONE = 640; // Below it the bubble sits at the bottom of the screen, or the top when what it shows is down there.
const LOW = 260;
const ROOM = 220; // A bubble's usual height: below what it shows when it fits, above it otherwise.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Where the step's target is on screen, read every frame: pages scroll, load and reflow under the guide. */
function useTarget(selector, active, reducedMotion) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!active || !selector) return undefined;
    let frame;
    let last = null; // The first read always lands, even when the target is missing.
    let scrolled = false;
    const tick = () => {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect();
      const box = r && r.width + r.height > 0 ? { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null;
      if (box && !scrolled) {
        scrolled = true;
        if (box.top < 64 || box.top + box.height > window.innerHeight - ROOM) el.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      }
      const key = box ? [box.left, box.top, box.width, box.height].map(Math.round).join() : "";
      if (key !== last) {
        last = key;
        setRect(box);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [selector, active, reducedMotion]);
  return active && selector ? rect : null;
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return size;
}

/** Where the bubble goes: beside what it shows on a computer, docked at an edge on a phone. */
function placement(rect, vp, last) {
  if (vp.w < PHONE) return { className: rect && rect.top + rect.height > vp.h - LOW ? "guide--top" : "guide--bottom", style: undefined, arrow: null };
  const width = Math.min(last ? 440 : 360, vp.w - EDGE * 2);
  if (!rect) return { className: "", style: { width, left: (vp.w - width) / 2, top: vp.h * 0.3 }, arrow: null };
  const below = rect.top + rect.height + ROOM < vp.h || rect.top < ROOM + EDGE;
  const left = clamp(rect.left + rect.width / 2 - width / 2, EDGE, vp.w - width - EDGE);
  const style = below ? { width, left, top: Math.min(rect.top + rect.height + GAP, vp.h - 200) } : { width, left, bottom: vp.h - rect.top + GAP };
  return { className: "", style, arrow: { x: clamp(rect.left + rect.width / 2 - left, 20, width - 20), up: below } };
}

/**
 * The newcomer's guide, step by step on the real screens (look A of the prototype): a bubble beside what it shows,
 * an ember frame around it, nothing dimmed. It starts by itself after the Last.fm link and keeps the newcomer
 * company while the first import runs, up to their first automation.
 */
export default function Guide() {
  const g = useGuide();
  const { user, refreshUser } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const vp = useViewport();
  const linked = Boolean(user?.lastfm_username);
  const status = useScrobbleSync(linked && g.on);
  const step = STEPS[g.step] ?? STEPS[0];
  const here = g.on && onRoute(step, pathname);
  const rect = useTarget(step.target, here, reducedMotion);
  const bubble = useRef(null);

  // Once per account: finished or skipped on any device, it never starts by itself again.
  useEffect(() => {
    if (linked && !user.guide_done_at && !g.on && g.endedFor !== user.id) guide.start();
  }, [linked, user, g.on, g.endedFor]);

  // The steps that end with the user's own click: their page arriving moves the guide on.
  useEffect(() => {
    if (!g.on || !arrived(step, pathname)) return;
    guide.set({ step: g.step + 1, filled: {}, automation: step.goes === EDITOR ? g.automation : pathname });
  }, [pathname, g.on, g.step, g.automation, step]);

  const end = () => {
    guide.set({ on: false, endedFor: user.id });
    setGuideDone(true).then(refreshUser).catch(() => {}); // Kept in this browser anyway: it will not start again here.
  };

  useEffect(() => {
    if (!here) return undefined;
    const onKey = (e) => {
      // Escape in a field or an open list belongs to them.
      if (e.key === "Escape" && !e.target.closest?.("input, textarea, [role=combobox], [role=listbox], [role=option]")) end();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A step that asks for a field puts the focus in it; the others on the bubble's way on.
  useEffect(() => {
    if (!here) return;
    const field = step.needs && document.querySelector(step.target)?.querySelector("input, button");
    (field || bubble.current?.querySelector("[data-guide-next]") || bubble.current?.querySelector("h2"))?.focus({ preventScroll: true });
  }, [here, step]);

  if (!linked || !g.on) return null;
  if (!here) {
    const resume = () => {
      if (step.route === EDITOR) {
        guide.set({ step: EDITOR_START, filled: {} }); // The editor starts blank again: so does its part of the guide.
        navigate(EDITOR);
      } else navigate(typeof step.route === "string" ? step.route : (g.automation ?? "/automations"));
    };
    return (
      <button type="button" className="guide-resume" onClick={resume}>
        Resume guide · {g.step + 1}/{STEPS.length}
      </button>
    );
  }

  const c = guideContext(status, g.preview);
  const note = step.note?.(c);
  const missing = step.id === "new" && !rect; // No runs yet shows the button; a replay on a busy account has none.
  const back = () => {
    const previous = STEPS[g.step - 1];
    guide.set({ step: g.step - 1 });
    if (typeof previous.route === "string" && previous.route !== pathname) navigate(previous.route);
  };
  const next = () => (step.last ? end() : guide.set({ step: g.step + 1 }));
  const { className, style, arrow } = placement(rect, vp, step.last);

  return (
    <>
      {rect && <div className="guide-frame" style={rect} aria-hidden="true" />}
      <div ref={bubble} role="dialog" aria-modal="false" aria-labelledby="guide-title" aria-describedby="guide-text" data-quiet className={`guide ${className}`} style={style}>
        {arrow && <span className={`guide__arrow ${arrow.up ? "guide__arrow--up" : "guide__arrow--down"}`} style={{ left: arrow.x }} aria-hidden="true" />}
        <h2 id="guide-title" tabIndex={-1} className="font-heading text-xl text-(--ember) outline-none">{step.title(c)}</h2>
        <p id="guide-text" className="pt-1 text-base">{step.text(c)}</p>
        {note && <p className="pt-2 text-sm text-(--text-muted)">{note}</p>}
        <div className="guide__controls">
          <span className="font-heading text-xl text-(--ember)" aria-label={`Step ${g.step + 1} of ${STEPS.length}`}>
            {g.step + 1}<span className="text-(--text-muted)">/{STEPS.length}</span>
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!step.last && <button type="button" className="guide__skip" onClick={end}>Skip</button>}
            {g.step > 0 && !step.last && <button type="button" className="guide__button guide__button--outline" onClick={back}>Back</button>}
            {step.id === "name" && !g.filled.name && (
              <button type="button" className="guide__button guide__button--outline" onClick={() => guide.fill("name")}>Use this name</button>
            )}
            {missing && <button type="button" data-guide-next className="guide__button" onClick={() => navigate(EDITOR)}>New automation</button>}
            {!missing && !canGoOn(step, g.filled) && <span className="guide__hint">{step.action}</span>}
            {canGoOn(step, g.filled) && (
              <button type="button" data-guide-next className="guide__button" onClick={next}>{step.last ? "Done" : "Next"}</button>
            )}
          </div>
        </div>
      </div>
      <div className="sr-only" aria-live="polite">{step.title(c)}</div>
    </>
  );
}
