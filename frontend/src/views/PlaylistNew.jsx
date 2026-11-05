import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconChevronDown } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import CronEditor from "@/components/builder/CronEditor";
import FilterBuilder from "@/components/builder/FilterBuilder";
import PixelNumber from "@/components/elements/PixelNumber";
import { Button } from "@/components/ui/button";
import CustomSelect from "@/components/ui/CustomSelect";
import { Input, NumberInput } from "@/components/ui/input";
import { useLivePreview } from "@/hooks/useLivePreview";
import { createAutomation } from "@/lib/api";
import {
  PRESETS,
  SORT_OPTIONS,
  WINDOW_OPTIONS,
  applyPreset,
  countActiveConditions,
  countIncompleteConditions,
  createDefaultAutomation,
  describeOutcome,
  describePeriod,
  describeWaiting,
  isValidCron,
  matchingPreset,
  suggestName,
  toPayload,
  usesTagFilter,
  windowOption,
} from "@/lib/automation-rules";
import { useAuth } from "../contexts/AuthContext";

const CUSTOM = "custom";
const WINDOW_CHOICES = [...WINDOW_OPTIONS, { value: CUSTOM, label: "Custom" }];
const UNITS = ["day", "week", "month", "year"].map((value) => ({ value, label: `${value}s` }));
const Muted = ({ children }) => <span className="text-sm text-(--text-muted)">{children}</span>;
// A kept track slides to its new rank; a new one dithers in from the top, and a dropped one steps out.
const ROW_MOVE = { layout: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } };
const ROW_EXIT = { opacity: 0, transition: { duration: 0.12, ease: (t) => Math.ceil(t * 3) / 3 } };
const ROW_STAGGER_LIMIT = 14; // Past the visible rows, waiting would only delay what's off-screen.
const MOBILE_ROWS = 8; // Keep in step with the nth-child below: the page must not end after 200 rows on a phone.
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[8rem_minmax(0,1fr)_9rem]";

function Count({ value, unit }) {
  if (value == null) return <span className="sm:order-last" />;
  return (
    <span className="text-right whitespace-nowrap sm:order-last">
      <span className="font-heading text-2xl tabular-nums"><PixelNumber value={value} /></span> <Muted>{unit}</Muted>
    </span>
  );
}

/** One link of the chain: its name, its control, what it leaves. */
function Stage({ label, count, children, below }) {
  return (
    <section className="py-3">
      <div className={ROW}>
        <h2 className="font-sans text-base">{label}</h2>
        {count ?? <span className="sm:order-last" />}
        <div className="col-span-2 min-w-0 sm:col-span-1">{children}</div>
      </div>
      {below}
    </section>
  );
}

/** A stage folded by default, whose closed state still says what it holds. */
function FoldedStage({ label, state, count, children }) {
  return (
    <details className="group py-3">
      <summary className={`${ROW} cursor-pointer list-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ember-9) [&::-webkit-details-marker]:hidden`}>
        <span className="flex items-center gap-2 text-base">
          {label}
          <IconChevronDown size={16} className="shrink-0 text-(--text-muted) transition-transform duration-(--duration-quick) group-open:rotate-180" />
        </span>
        {count ?? <span className="sm:order-last" />}
        <span className="col-span-2 min-w-0 truncate text-sm text-(--text-muted) sm:col-span-1">{state}</span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function CustomWindow({ window, onChange }) {
  const { length, ago } = window;
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <Muted>Last</Muted>
      <NumberInput aria-label="Window length" min={1} max={1000} value={length?.amount} onChange={(amount) => onChange({ ...window, length: { ...length, amount } })} />
      <CustomSelect label="Window length unit" value={length?.unit ?? "month"} onChange={(unit) => onChange({ ...window, length: { ...length, unit } })} options={UNITS} className="w-28" />
      <Muted>ending</Muted>
      <NumberInput aria-label="Window end" min={0} max={1000} value={ago?.amount ?? 0} onChange={(amount) => onChange({ ...window, ago: { unit: ago?.unit ?? "year", amount: amount || null } })} />
      <CustomSelect label="Window end unit" value={ago?.unit ?? "year"} onChange={(unit) => onChange({ ...window, ago: { amount: ago?.amount ?? null, unit } })} options={UNITS} className="w-28" />
      <Muted>ago</Muted>
    </div>
  );
}

function LimitField({ label, value, onChange, max }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <Muted>{label}</Muted>
      <NumberInput min={1} max={max} value={value} placeholder="None" onChange={onChange} />
    </label>
  );
}

function Preview({ preview, draft, linked }) {
  const { result, loading, failed } = preview;
  const [showAll, setShowAll] = useState(false);
  const wanted = draft.output.maxSize ?? 50;

  if (!linked) {
    return (
      <p className="py-3 text-sm text-(--text-muted)">
        <Link to="/link-lastfm" className="text-(--ember) underline underline-offset-4">Link your Last.fm account</Link> to see what this automation makes.
      </p>
    );
  }
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 pb-3">
        <h2 className="text-2xl">Preview</h2>
        <p className="text-sm text-(--text-muted)" role="status">
          {loading ? "Updating" : result && plural(result.total, "track")}
        </p>
      </div>
      {result?.period && <p className="pb-2 text-sm text-(--text-muted)">Covers {describePeriod(result.period)}.</p>}
      {failed && !loading && <p className="pb-2 text-sm text-(--ember)" role="alert">The preview could not update. Change a setting to try again.</p>}
      {result && result.total > 0 && result.total < wanted && (
        <p className="pb-2 text-sm text-(--text-muted)">Only {result.total} of the {wanted} tracks you asked for fit these settings.</p>
      )}
      {result && usesTagFilter(draft.filterGroups) && result.known_tag_artists < result.window_artists && (
        <p className="pb-2 text-sm text-(--text-muted)">
          Tags known for {result.known_tag_artists} of {result.window_artists} artists so far. The others match no tag filter yet.
        </p>
      )}
      {draft.output.noRepeatPlaylists && (
        <p className="pb-2 text-sm text-(--text-muted)">Repeats can only be skipped once this automation has playlists, so this preview still shows them.</p>
      )}
      {result?.total === 0 && <p className="py-3 text-sm text-(--text-muted)">No track fits. Try a wider window or fewer rules.</p>}
      {result && result.total > 0 && (
        <motion.ol layoutScroll className={`relative min-h-0 flex-1 divide-y divide-(--line) overflow-y-auto ${showAll ? "" : "max-lg:[&>li:nth-child(n+9)]:hidden"}`}>
          <AnimatePresence mode="popLayout" initial={false}>
            {result.tracks.map((track, i) => (
              <motion.li
                key={`${track.artist}-${track.title}`}
                layout="position"
                transition={ROW_MOVE}
                exit={ROW_EXIT}
                className="preview-row flex items-center gap-3 py-2 pr-2"
                style={{ "--row": Math.min(i, ROW_STAGGER_LIMIT) }}
              >
                <span className="w-8 shrink-0 text-right text-sm text-(--text-muted) tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base">{track.title}</span>
                  <span className="block truncate text-sm text-(--text-muted)">{track.artist}</span>
                </span>
                {track.playcount != null && <span className="shrink-0 text-sm text-(--text-muted) tabular-nums" title="Plays" aria-label={plural(track.playcount, "play")}>{track.playcount}</span>}
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ol>
      )}
      {!showAll && result && result.tracks.length > MOBILE_ROWS && (
        <Button variant="outline" size="sm" onClick={() => setShowAll(true)} className="mt-2 self-start lg:hidden">
          Show all {result.tracks.length}
        </Button>
      )}
    </>
  );
}

export default function PlaylistNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const linked = Boolean(user?.lastfm_username);
  const [draft, setDraft] = useState(createDefaultAutomation);
  const [typedName, setTypedName] = useState(null);
  const [customWindow, setCustomWindow] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    document.title = "New automation - ListFM";
  }, []);

  const suggestion = suggestName(draft);
  const name = typedName?.trim() || suggestion;
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setOutput = (patch) => setDraft((d) => ({ ...d, output: { ...d.output, ...patch } }));

  const payload = toPayload(draft);
  // The schedule sets the period a run covers; a half-typed cron must not fail the preview.
  const preview = useLivePreview(linked ? { ...payload, name, cron: isValidCron(draft.cron) ? draft.cron : "", id: undefined, createdAt: undefined, updatedAt: undefined } : null);
  const { result } = preview;

  const windowIsCustom = customWindow || !windowOption(draft.window);
  const pickWindow = (value) => {
    setCustomWindow(value === CUSTOM);
    update({ window: value === CUSTOM ? { length: { amount: 2, unit: "week" }, ago: null } : WINDOW_OPTIONS.find((o) => o.value === value).window });
  };

  const ruleCount = countActiveConditions(draft.filterGroups);
  const limitCount = ["maxPerArtist", "maxPerAlbum", "noRepeatPlaylists"].filter((k) => draft.output[k]).length;
  const incompleteCount = countIncompleteConditions(draft.filterGroups);
  const ruleState = [ruleCount ? plural(ruleCount, "rule") : "No rules", incompleteCount > 0 && `${incompleteCount} not applied yet`].filter(Boolean).join(", ");
  const selected = matchingPreset(draft)?.id;
  const badSchedule = Boolean(draft.cron) && !isValidCron(draft.cron);
  const outcome = badSchedule ? "Fix the schedule to create this automation." : describeOutcome(draft.cron, result ?? undefined);

  const create = async ({ run = false } = {}) => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createAutomation({ ...payload, name });
      // The detail page runs it: its progress and its "history still loading" answer already live there.
      navigate(`/playlists/${created.id}`, { state: { created: run ? "Created." : `Created. ${describeWaiting(draft.cron, result ?? undefined)}`, runNow: run } });
    } catch (err) {
      console.error("Failed to create automation:", err);
      const reason = (err.message || "The automation could not be created. Try again.").replace(/^API \d+: /, "");
      setCreateError(reason.startsWith("Invalid cron") ? "That schedule isn't valid. Check each part: minute hour day month weekday." : reason);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="h-full w-full min-w-0 flex-1 overflow-y-auto px-4 pb-40 text-left md:px-8 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <header data-quiet className="pt-4">
          <h1 className="text-4xl">New automation</h1>
          <div className="flex flex-wrap gap-2 pt-3">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                variant={selected === preset.id ? "default" : "outline"}
                aria-pressed={selected === preset.id}
                onClick={() => {
                  setCustomWindow(false);
                  setDraft((d) => applyPreset(d, preset));
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </header>

        {/* The ribbon runs through this gap and narrows with the chain's counts. */}
        <div data-chain={result ? [result.before_filter, result.after_filter, result.total].join(",") : ""} aria-hidden="true" className="h-14" />

        <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          {/* Below lg the three blocks stack as settings, preview, actions. */}
          <div className="min-w-0 max-lg:contents lg:space-y-4">
          <div data-quiet className="min-w-0 divide-y divide-(--line)">
            <Stage label="Window" count={<Count value={result?.before_filter} unit="tracks" />} below={windowIsCustom && <CustomWindow window={draft.window} onChange={(window) => update({ window })} />}>
              <CustomSelect label="Window" value={windowIsCustom ? CUSTOM : windowOption(draft.window).value} onChange={pickWindow} options={WINDOW_CHOICES} />
            </Stage>

            <FoldedStage label="Refine" state={ruleState} count={<Count value={result?.after_filter} unit="kept" />}>
              <FilterBuilder value={draft.filterGroups} onChange={(filterGroups) => update({ filterGroups })} />
            </FoldedStage>

            <Stage label="Sort">
              <CustomSelect label="Sort" value={draft.sort} onChange={(sort) => update({ sort })} options={SORT_OPTIONS.map(({ value, label }) => ({ value, label }))} />
            </Stage>

            <Stage label="Size" count={<Count value={result?.total} unit="in playlist" />}>
              <div className="flex items-center gap-2">
                <NumberInput aria-label="Playlist size" min={1} max={200} value={draft.output.maxSize} onChange={(maxSize) => setOutput({ maxSize })} />
                <Muted>tracks at most</Muted>
              </div>
            </Stage>

            <FoldedStage label="More limits" state={limitCount ? plural(limitCount, "limit") : "None"}>
              <div className="max-w-sm space-y-2">
                <LimitField label="Tracks per artist" max={200} value={draft.output.maxPerArtist} onChange={(maxPerArtist) => setOutput({ maxPerArtist })} />
                <LimitField label="Tracks per album" max={200} value={draft.output.maxPerAlbum} onChange={(maxPerAlbum) => setOutput({ maxPerAlbum })} />
                <LimitField label="No repeats from the last playlists" max={50} value={draft.output.noRepeatPlaylists} onChange={(noRepeatPlaylists) => setOutput({ noRepeatPlaylists })} />
              </div>
            </FoldedStage>

            <Stage label="Schedule">
              <CronEditor value={draft.cron} onChange={(cron) => update({ cron })} />
            </Stage>

            <Stage label="Name">
              <Input aria-label="Name" value={typedName ?? suggestion} placeholder={suggestion} onChange={(e) => setTypedName(e.target.value)} className="w-full" />
            </Stage>
          </div>


          {/* Below lg the actions stay pinned: the settings and the preview are a long scroll. */}
          <div data-quiet className="space-y-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:border-t-2 max-lg:border-(--line) max-lg:bg-(--ground) max-lg:px-4 max-lg:py-2">
            <p className={`text-sm ${badSchedule ? "text-(--ember)" : "text-(--text-muted)"}`}>
              {result && <span className="lg:hidden">{plural(result.total, "track")}. </span>}
              {outcome}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => create({ run: true })} disabled={creating || !linked || badSchedule}>
                {creating ? "Creating" : "Create and run"}
              </Button>
              <Button size="lg" variant="outline" onClick={() => create()} disabled={creating || !linked || badSchedule}>
                Create only
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/playlists")} className="max-lg:hidden">
                Cancel
              </Button>
            </div>
            {createError && <p className="text-sm text-(--ember)" role="alert">{createError}</p>}
          </div>
          </div>

          <aside data-quiet className="flex min-h-0 min-w-0 flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:self-start">
            <Preview preview={preview} draft={draft} linked={linked} />
          </aside>
        </div>
      </div>
    </main>
  );
}
