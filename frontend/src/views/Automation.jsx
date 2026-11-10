import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { IconChevronRight } from "@tabler/icons-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAutomation } from "@/hooks/useAutomation";
import { useAutomations } from "@/hooks/useAutomations";
import { useScrobbleSync } from "@/hooks/useScrobbleSync";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import DeleteAction from "@/components/ui/DeleteAction";
import PlaylistCover from "@/components/ui/PlaylistCover";
import Loader from "@/components/elements/Loader";
import { Gone, LinkLastfmHint, LoadFailed, StatePage } from "@/components/elements/PageStates";
import {
  deleteAutomation,
  getAutomationHistory,
  getRunProgress,
  newProgressToken,
  pollProgress,
  retryRun,
  runAutomationNow,
} from "@/lib/api";
import { RUNS_DONE, timeLeft } from "@/lib/backgroundWork";
import { describeAutomation, describeSchedule, describeWaiting } from "@/lib/automation-rules";
import { RUN_TONES, chainsOf, daysOf, describeRun, timeOf } from "@/lib/runs";
import { FOCUS } from "@/lib/utils";

const STAGES = new Map([["source", "Reading your listens"], ["filter", "Applying filters"], ["done", "Finishing"]]);
const ROW = "grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-x-3 py-2.5";
const HISTORY_LIMIT = 50; // What the server returns.
const REFRESH_MS = 30_000; // Long enough to be cheap: a next try is minutes away.
const apiMessage = (err, fallback) => (err?.message || fallback).replace(/^API \d+: /, "");

function RunningDetail({ progress }) {
  const { stage, done, total } = progress;
  return (
    <p role="status" className="text-sm text-(--text-muted)">
      {STAGES.get(stage) ?? "Starting"}{total > 0 ? ` · ${done} of ${total} tracks` : ""}
    </p>
  );
}

/** The attempts behind a run that failed more than once, folded: the line already says the outcome. */
function Tries({ tries }) {
  if (tries.length < 2) return null;
  return (
    <details className="group pt-1">
      <summary className={`w-fit cursor-pointer list-none text-sm text-(--text-muted) hover:text-(--ember) pointer-coarse:py-2.5 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
        {tries.length} tries
      </summary>
      <ol className="pt-1">
        {tries.map((attempt) => (
          <li key={attempt.id} className="text-sm text-(--text-muted)">
            {timeOf(attempt.started_at)}{attempt.error_message ? ` · ${attempt.error_message}` : ""}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** What a waiting run waits for, with the time the server expects it to take. */
function waitingFor(head, listens) {
  const eta = !listens ? null : listens.complete ? listens.tags_eta_seconds : listens.eta_seconds;
  const left = timeLeft(eta);
  return left ? `${head.error_message} It starts by itself, ${left}.` : `${head.error_message} It starts by itself.`;
}

function RunRow({ chain, progress, retryable, busy, onRetry, listens }) {
  const { head, tries } = chain;
  const { label, tone } = describeRun(head);
  const time = <span className="text-sm text-(--text-muted) tabular-nums leading-6">{timeOf(head.started_at)}</span>;

  if (head.generated_playlist_id && head.status === "completed") {
    return (
      <Link
        to={`/playlists/${head.generated_playlist_id}`}
        className={`${ROW} transition-colors duration-(--duration-quick) hover:bg-(--ember-1) focus-visible:bg-(--ember-1) ${FOCUS}`}
      >
        {time}
        <span className={`text-base ${RUN_TONES[tone]}`}>{label}</span>
        <IconChevronRight size={16} className="mt-1 text-(--text-muted)" aria-hidden="true" />
      </Link>
    );
  }
  return (
    // The ribbon leans toward a running line, as it does toward any loader.
    <div className={ROW} data-loader={head.status === "running" ? "" : undefined}>
      {time}
      <div className="min-w-0">
        <p className={`text-base ${RUN_TONES[tone]}`}>{label}</p>
        {head.status === "running" && progress && <RunningDetail progress={progress} />}
        {head.status === "failed" && head.error_message && <p className="text-sm text-(--text-muted)">{head.error_message}</p>}
        {head.status === "waiting" && <p className="text-sm text-(--text-muted)">{waitingFor(head, listens)}</p>}
        {head.status !== "running" && <Tries tries={tries} />}
      </div>
      {retryable ? <Button variant="outline" size="sm" onClick={onRetry} disabled={busy}>Re-run</Button> : <span />}
    </div>
  );
}

function History({ rows, failed, onReload, run, listens, onRetry, automation }) {
  if (failed && !rows) return <LoadFailed subject="The history" onRetry={onReload} />;
  if (!rows) return <p role="status" className="text-sm text-(--text-muted)">Loading history</p>;

  const chains = chainsOf(rows);
  const latest = rows[0];
  // A retry runs in place on its line; a fresh run gets a new line on top.
  const shown = chains.map((chain) => (run?.retrying === chain.head.id ? { ...chain, head: { ...chain.head, status: "running" } } : chain));
  if (run && !run.retrying) {
    const started = new Date().toISOString();
    shown.unshift({ head: { id: "starting", status: "running", started_at: started, scheduled_for: started, attempt: 1 }, tries: [] });
  }

  if (shown.length === 0) {
    return (
      <>
        <p className="text-2xl">No runs yet</p>
        <p className="pt-1 text-base text-(--text-muted)">{describeWaiting(automation.enabled === false ? null : automation.cron)}</p>
      </>
    );
  }
  return (
    <>
      {daysOf(shown).map(({ day, chains: list }) => (
        <section key={day} className="pb-4">
          <h3 className="font-sans text-sm text-(--text-muted)">{day}</h3>
          <ol className="divide-y divide-(--line)">
            {list.map((chain) => (
              <li key={chain.head.id}>
                <RunRow
                  chain={chain}
                  progress={run}
                  retryable={chain.head.id === latest?.id && chain.head.status === "failed"}
                  busy={Boolean(run)}
                  onRetry={() => onRetry(chain.head.id)}
                  listens={listens}
                />
              </li>
            ))}
          </ol>
        </section>
      ))}
      {rows.length >= HISTORY_LIMIT && <p className="text-sm text-(--text-muted)">Showing the latest {HISTORY_LIMIT} tries.</p>}
    </>
  );
}

export default function Automation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // What the Creator sent: read once, then cleared so a reload neither repeats the run nor the message.
  const [arrival] = useState(location.state);
  const arrivalRun = useRef(arrival?.runNow);
  const { user } = useAuth();
  const username = user?.lastfm_username;
  const { automation, isLoading, error, update, refetch } = useAutomation(username ? id : null);
  const { generatedPlaylists } = useAutomations(username);
  // A run waiting for the listens or the tags says how long they should take.
  const listensSync = useScrobbleSync(Boolean(username));

  const [rows, setRows] = useState(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [run, setRun] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pausing, setPausing] = useState(false);

  useEffect(() => {
    if (automation?.name) document.title = `${automation.name} - ListFM`;
  }, [automation?.name]);

  const loadHistory = useCallback(() => getAutomationHistory(id)
    .then((list) => {
      setRows(list);
      setHistoryFailed(false);
    })
    .catch(() => {
      setHistoryFailed(true);
    }), [id]);

  useEffect(() => {
    loadHistory();
    window.addEventListener(RUNS_DONE, loadHistory);
    return () => window.removeEventListener(RUNS_DONE, loadHistory);
  }, [loadHistory]);

  // The sweep works without anyone watching: a line that is about to change follows it.
  const latest = rows?.[0];
  const moving = latest?.status === "running" || latest?.status === "waiting" || Boolean(latest?.next_retry_at);
  useEffect(() => {
    if (!moving) return undefined;
    const timer = setInterval(loadHistory, REFRESH_MS);
    return () => clearInterval(timer);
  }, [moving, loadHistory]);

  const start = async (send, retrying = null) => {
    if (run) return;
    setActionError(null);
    setRun({ stage: "queued", done: 0, total: 0, retrying });
    const token = newProgressToken();
    let stopped = false;
    // Fire the POST first so the ticket exists ASAP, then poll alongside it.
    const posted = send(token);
    pollProgress(() => getRunProgress(id, token), {
      onUpdate: (progress) => {
        if (!stopped) setRun((current) => current && { ...current, ...progress });
      },
      shouldStop: () => stopped,
      // A lost progress ticket costs only the detail: the line still says Running until the run ends.
    }).catch(() => {});
    try {
      await posted;
    } catch (err) {
      setActionError(apiMessage(err, "The run could not start. Try again."));
    } finally {
      stopped = true;
      await loadHistory();
      setRun(null);
    }
  };
  const runNow = () => start((token) => runAutomationNow(id, token));
  const retry = (historyId) => start((token) => retryRun(id, historyId, token), historyId);

  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  // Checked on every render, it fires once: as soon as the automation is there.
  useEffect(() => {
    if (!automation || !arrivalRun.current) return;
    arrivalRun.current = false;
    runNow();
  });

  const togglePaused = async () => {
    setPausing(true);
    setActionError(null);
    try {
      await update({ enabled: !automation.enabled });
    } catch (err) {
      setActionError(apiMessage(err, "This automation could not be changed. Try again."));
    } finally {
      setPausing(false);
    }
  };

  if (!automation) {
    if (!username) return <StatePage><LinkLastfmHint purpose="to see this automation." /></StatePage>;
    if (isLoading || !error) return <StatePage><Loader /></StatePage>;
    if (/API 404/.test(error)) return <StatePage><Gone subject="This automation" to="/automations" back="Back to automations" /></StatePage>;
    return <StatePage><LoadFailed subject="This automation" onRetry={refetch} /></StatePage>;
  }

  const paused = automation.enabled === false;
  const cover = generatedPlaylists.find((playlist) => playlist.automation_id === id);
  const name = automation.name || "Untitled";

  return (
    <main
      data-ribbon-hot={latest?.status === "failed" && !run ? "" : undefined}
      className="scroll-edge h-full w-full min-w-0 flex-1 overflow-y-auto px-4 pb-8 text-left md:px-8"
    >
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-6 pt-4 lg:grid-cols-[384px_minmax(0,1fr)]">
        <header data-quiet className="min-w-0 [@media(min-width:64rem)_and_(min-height:50rem)]:sticky [@media(min-width:64rem)_and_(min-height:50rem)]:top-4 lg:self-start">
          <Link to="/automations" className={`inline-block pb-3 text-sm text-(--text-muted) hover:text-(--ember) pointer-coarse:py-2.5 ${FOCUS}`}>
            Back to automations
          </Link>
          <div className="flex gap-4 lg:block">
            <PlaylistCover seed={cover?.id ?? id} images={cover?.cover_images} className="w-[128px] shrink-0 lg:w-[384px]" />
            <div className="min-w-0 lg:pt-4">
              <h1 className="text-2xl break-words md:text-4xl">{name}</h1>
              <p className="pt-1 text-base">{describeAutomation(automation)}</p>
              <p className="text-sm text-(--text-muted)">{paused ? "Paused" : describeSchedule(automation.cron)}</p>
              {automation.description && <p className="pt-1 text-sm text-(--text-muted)">{automation.description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-4">
            <Button onClick={runNow} disabled={Boolean(run)}>{run ? "Running" : "Run now"}</Button>
            <Link to={`/automations/${id}/edit`} className={buttonVariants({ variant: "outline" })}>Edit</Link>
            <Button variant="outline" onClick={togglePaused} disabled={pausing}>{paused ? "Resume" : "Pause"}</Button>
            <DeleteAction
              title="Delete this automation?"
              description={`${name} will stop making playlists. The playlists it already made stay in your list.`}
              onDelete={async () => {
                await deleteAutomation(id);
                navigate("/automations", { replace: true });
              }}
              onFailed={(err) => setActionError(apiMessage(err, "This automation could not be deleted. Try again."))}
            />
          </div>
          {arrival?.notice && !actionError && <p role="status" className="pt-2 text-sm text-(--ember)">{arrival.notice}</p>}
          {actionError && <p role="alert" className="pt-2 text-sm text-(--ember)">{actionError}</p>}
        </header>

        <section data-quiet aria-labelledby="history-title" className="min-w-0 max-w-2xl">
          <h2 id="history-title" className="pb-3 text-2xl">History</h2>
          <History rows={rows} failed={historyFailed} onReload={loadHistory} run={run} listens={listensSync} onRetry={retry} automation={automation} />
        </section>
      </div>
    </main>
  );
}
