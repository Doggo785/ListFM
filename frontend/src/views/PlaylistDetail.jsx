import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconTrash,
  IconPlayerPlay,
  IconRefresh,
  IconCalendarRepeat,
  IconSettings,
  IconEye,
  IconMusic,
  IconFilter,
  IconHistory,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import CustomSelect from "@/components/ui/CustomSelect";
import Modal from "@/components/ui/Modal";
import BorderGlow from "@/components/ui/BorderGlow";
import Loader from "@/components/elements/Loader";
import FilterBuilder from "@/components/builder/FilterBuilder";
import CronEditor from "@/components/builder/CronEditor";
import {
  previewAutomation,
  getAutomationHistory,
  runAutomationNow,
  getGeneratedPlaylistTracks,
  updateAutomation,
  deleteAutomation,
  newProgressToken,
  getPreviewProgress,
  cancelPreview,
  getRunProgress,
  pollProgress,
} from "@/lib/api";
import { useAutomation } from "@/hooks/useAutomation";
import { useScrobbleSync } from "@/hooks/useScrobbleSync";
import {
  SORT_OPTIONS,
  WINDOW_OPTIONS,
  describeAutomation,
  usesTagFilter,
  windowOption,
} from "@/lib/automation-rules";
import { useAuth } from "../contexts/AuthContext";

const GLOW_COLORS = ["#c084fc", "#f472b6", "#38bdf8"];

function SectionCard({ title, icon, children, delay = 0 }) {
  const IconComp = icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
    >
      <div className="rounded-2xl border border-neutral-800 bg-[#1a1a1a] shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:border-neutral-700 transition-colors">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800/80">
          <div className="rounded-lg bg-[var(--ember)]/10 p-2">
            <IconComp size={16} className="text-[var(--ember)]" />
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <div className="p-6 space-y-5">{children}</div>
      </div>
    </motion.div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

const STAGE_LABELS = new Map([
  ["queued", "Starting..."],
  ["source", "Reading your listens..."],
  ["filter", "Applying filters..."],
  ["running", "Running..."],
  ["done", "Done"],
  ["error", "Failed"],
  ["cancelled", "Cancelled"],
]);

function ProgressBar({ progress, onCancel }) {
  if (!progress) return null;
  const { stage, done, total } = progress;
  // Map lookup (not obj[stage]): stage comes from the server, and computed
  // member access on plain objects is a prototype-pollution-shaped pattern.
  const label = STAGE_LABELS.get(stage) ?? stage;
  const active = !["done", "error", "cancelled"].includes(stage);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  return (
    <div className="rounded-xl border border-neutral-800 bg-[#141414] px-4 py-3" role="status">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-300">
          {label}
          {typeof done === "number" && typeof total === "number" && total > 0 && (
            <span className="text-neutral-500 tabular-nums">
              {" "}· {done} of {total} tracks
            </span>
          )}
        </p>
        {active && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-white hover:border-[var(--ember)] hover:text-[var(--ember)] transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
      {active && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
          {pct === null ? (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--ember)]" />
          ) : (
            <div
              className="h-full rounded-full bg-[var(--ember)] transition-all"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** What a preview depends on: anything else (name, schedule) leaves it valid. */
const previewSignature = (automation) =>
  JSON.stringify([automation?.window, automation?.sort, automation?.filterGroups, automation?.output]);

// updatedAt changes on every edit, even one undone by hand.
const savedSignature = (automation) => JSON.stringify({ ...automation, updatedAt: null });

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // What the Creator sent: read once, then cleared so a reload neither repeats the run nor the message.
  const [arrival] = useState(location.state);
  const arrivalRun = useRef(arrival?.runNow);
  const { user } = useAuth();
  const username = user?.lastfm_username;

  const listensSync = useScrobbleSync(Boolean(username));
  // After a failed load the button stays usable: a click starts the load again.
  const listensLoading = listensSync !== null && !listensSync.complete && listensSync.stage !== "error";

  const {
    automation: loadedAutomation,
    error: automationError,
  } = useAutomation(username && id ? id : null);

  const [automation, setAutomation] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [runningNow, setRunningNow] = useState(false);
  const [runError, setRunError] = useState(null);
  const [runProgress, setRunProgress] = useState(null);
  const [previewProgress, setPreviewProgress] = useState(null);
  const previewTokenRef = useRef(null);
  const previewStoppedRef = useRef(false);
  const [expandedId, setExpandedId] = useState(null);
  const [entryTracks, setEntryTracks] = useState({});
  const [tracksLoadingId, setTracksLoadingId] = useState(null);

  useEffect(() => {
    document.title = automation?.name ? `${automation.name} - ListFM` : "Playlist - ListFM";
  }, [automation?.name]);

  useEffect(() => {
    if (loadedAutomation) {
      setAutomation(loadedAutomation);
      setLastSaved(savedSignature(loadedAutomation));
      setNotFound(false);
    }
  }, [loadedAutomation]);

  useEffect(() => {
    if (automationError) {
      setNotFound(true);
    } else if (loadedAutomation) {
      setNotFound(false);
    }
  }, [automationError, loadedAutomation]);

  const update = useCallback((patch) => {
    setAutomation((prev) => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));
    setSaved(false);
  }, []);

  const updateListens = useCallback((patch) => {
    setAutomation((prev) => ({
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
    setSaved(false);
  }, []);

  const updateCron = useCallback((cron) => {
    setAutomation((prev) => ({
      ...prev,
      cron,
      updatedAt: new Date().toISOString(),
    }));
    setSaved(false);
  }, []);

  const updateFilters = useCallback((filterGroups) => {
    setAutomation((prev) => ({
      ...prev,
      filterGroups,
      updatedAt: new Date().toISOString(),
    }));
    setSaved(false);
  }, []);

  const saveChanges = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateAutomation(automation.id, automation);
      setLastSaved(savedSignature(automation));
      return true;
    } catch (err) {
      console.error("Failed to save automation:", err);
      setSaveError(err.message || "Failed to save automation");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (await saveChanges()) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAutomation(automation.id);
      navigate("/playlists");
    } catch (err) {
      console.error("Failed to delete automation:", err);
      setDeleteError(err.message || "Failed to delete automation");
      setDeleting(false);
      // The message sits on the page: left open, the dialog would hide it.
      setShowDeleteConfirm(false);
    }
  };

  const loadHistory = useCallback(async () => {
    if (!id) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await getAutomationHistory(id));
    } catch (err) {
      setHistoryError(err.message || "Failed to load run history");
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const unsavedChanges = automation !== null && savedSignature(automation) !== lastSaved;
  let runHint = "Trigger this automation immediately. The run is recorded below with its frozen track list.";
  if (listensLoading) runHint = "Runs can start once your listening history has finished loading.";
  else if (unsavedChanges) runHint = "Your changes are saved first, then the run starts with them.";

  const handleRunNow = async () => {
    if (runningNow) return;
    setRunningNow(true);
    setRunError(null);
    setRunProgress({ stage: "queued", done: 0, total: 0 });
    // A run reads the saved settings, so unsaved ones would be silently ignored.
    if (unsavedChanges && !(await saveChanges())) {
      setRunProgress(null);
      setRunError("Your changes could not be saved, so the run did not start.");
      setRunningNow(false);
      return;
    }
    const token = newProgressToken();
    let stopped = false;
    // Fire the POST first so the ticket exists ASAP, then poll alongside it.
    const postPromise = runAutomationNow(id, token);
    pollProgress(() => getRunProgress(id, token), {
      onUpdate: (s) => {
        if (!stopped) setRunProgress(s);
      },
      shouldStop: () => stopped,
    }).catch((err) => {
      if (!stopped) setRunError(err.message || "Failed to track run progress");
    });
    try {
      const run = await postPromise;
      stopped = true;
      setRunError(null);
      setHistory(await getAutomationHistory(id));
      // A failed run's reason is on its history row, right below.
      setRunProgress(
        run.status === "failed"
          ? { stage: "error", done: 0, total: 0 }
          : { stage: "done", done: run.tracks_after_filter ?? 0, total: run.tracks_before_filter ?? 0 }
      );
    } catch (err) {
      stopped = true;
      setRunProgress(null);
      setRunError((err.message || "Failed to run automation").replace(/^API \d+: /, ""));
    } finally {
      setRunningNow(false);
    }
  };

  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  // Checked on every render, it fires once: as soon as the automation is there.
  useEffect(() => {
    if (!automation || !arrivalRun.current) return;
    arrivalRun.current = false;
    handleRunNow();
  });

  const toggleEntry = async (entry) => {
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
    if (entry.generated_playlist_id && !entryTracks[entry.id]) {
      setTracksLoadingId(entry.id);
      try {
        const tracks = await getGeneratedPlaylistTracks(entry.generated_playlist_id);
        setEntryTracks((prev) => ({ ...prev, [entry.id]: tracks }));
      } catch {
        setEntryTracks((prev) => ({ ...prev, [entry.id]: [] }));
      } finally {
        setTracksLoadingId(null);
      }
    }
  };

  const formatRunDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  const formatRunDuration = (startIso, endIso) => {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
    const secs = Math.round((end - start) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const MAX_ATTEMPT = 4;

  const scheduledDiffers = (entry) => {
    const a = new Date(entry.scheduled_for || entry.started_at).getTime();
    const b = new Date(entry.started_at).getTime();
    return (
      !Number.isNaN(a) && !Number.isNaN(b) && Math.abs(b - a) > 60 * 1000
    );
  };

  const statusDot = (status) =>
    status === "completed"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";

  const loadPreview = async () => {
    if (!username?.trim()) return;
    const token = newProgressToken();
    previewTokenRef.current = token;
    previewStoppedRef.current = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    setPreviewProgress({ stage: "queued", done: 0, total: 0 });
    // Fire the POST first so the ticket exists ASAP, then poll alongside it.
    const postPromise = previewAutomation(automation, token, id);
    pollProgress(() => getPreviewProgress(token), {
      onUpdate: (s) => {
        if (!previewStoppedRef.current) setPreviewProgress(s);
      },
      shouldStop: () => previewStoppedRef.current,
    }).catch((err) => {
      if (!previewStoppedRef.current) {
        setPreviewError(err.message || "Failed to track preview progress");
      }
    });
    try {
      const data = await postPromise;
      previewStoppedRef.current = true;
      setPreviewError(null);
      if (data.cancelled) {
        setPreviewProgress({ stage: "cancelled", done: 0, total: 0 });
        return;
      }
      setPreview({ ...data, signature: previewSignature(automation) });
      setPreviewProgress(null);
    } catch (err) {
      previewStoppedRef.current = true;
      setPreviewError(err.message || "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCancelPreview = async () => {
    previewStoppedRef.current = true;
    setPreviewProgress({ stage: "cancelled", done: 0, total: 0 });
    const token = previewTokenRef.current;
    if (!token) return;
    try {
      await cancelPreview(token);
    } catch {
      // Already finished or expired server-side; the UI state above stands.
    }
  };

  const previewTracks = preview?.tracks ?? null;
  // The server's answer to the settings it was asked about: never reworked here.
  const previewStale = preview !== null && preview.signature !== previewSignature(automation);

  if (notFound) {
    return (
      <div className="h-full w-full min-w-0 flex-1 overflow-y-auto p-5 md:p-10">
        <div className="mx-auto max-w-3xl text-center py-20" data-quiet>
          <div className="rounded-2xl bg-neutral-800/40 p-4 mb-6 inline-flex">
            <IconMusic size={32} className="text-neutral-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Automation not found</h2>
          <p className="text-neutral-400 mb-6">
            This automation may have been deleted or the link is invalid.
          </p>
          <Button onClick={() => navigate("/playlists")}>
            Back to playlists
          </Button>
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="h-full w-full min-w-0 flex-1 flex items-center justify-center">
        <Loader />
      </div>
    );
  }


  return (
    <main className="page-enter h-full w-full min-w-0 flex-1 overflow-y-auto p-5 md:p-10">
      <div className="mx-auto max-w-[1400px]" data-quiet>
        <motion.header
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <button
            type="button"
            onClick={() => navigate("/playlists")}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm mb-4 group"
          >
            <IconArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Back to playlists
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-white text-left">
                <span className="text-[#17AEFF]">Edit</span> automation
              </h2>
              <p className="mt-2 text-neutral-400 text-sm">
                {describeAutomation(automation)}
              </p>
              {arrival?.created && <p className="mt-2 text-sm text-(--ember)" role="status">{arrival.created}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
              >
                <IconTrash size={14} />
                Delete
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  "Saving..."
                ) : saved ? (
                  "Saved!"
                ) : (
                  <>
                    <IconDeviceFloppy size={14} />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.header>

        {saveError && (
          <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4 text-center mb-6">
            <p className="text-sm text-red-400">{saveError}</p>
          </div>
        )}

        {deleteError && (
          <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4 text-center mb-6">
            <p className="text-sm text-red-400">{deleteError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-8 items-start">
          <div className="space-y-6 pb-16">
            <SectionCard title="Identity" icon={IconSettings} delay={0.1}>
              <FieldRow label="Playlist name">
                <input
                  type="text"
                  value={automation.name}
                  onChange={(e) => update({ name: e.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-[#141414] px-4 py-3.5 text-base text-white placeholder:text-neutral-500 focus:border-[var(--ember)] focus:outline-none focus:ring-1 focus:ring-[var(--ember)] transition-all shadow-inner"
                />
              </FieldRow>
              <FieldRow label="Description">
                <textarea
                  value={automation.description || ""}
                  onChange={(e) => update({ description: e.target.value })}
                  rows={2}
                  placeholder="Optional description"
                  className="w-full rounded-xl border border-neutral-700 bg-[#141414] px-4 py-3.5 text-base text-white placeholder:text-neutral-500 focus:border-[var(--ember)] focus:outline-none focus:ring-1 focus:ring-[var(--ember)] transition-all resize-none shadow-inner"
                />
              </FieldRow>
            </SectionCard>

            <SectionCard title="Listens" icon={IconMusic} delay={0.2}>
              <div className="grid grid-cols-2 gap-3">
                {SORT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = automation.sort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateListens({ sort: opt.value })}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
                        isSelected
                          ? "border-[var(--ember)] bg-[var(--ember)]/10 shadow-[0_0_20px_rgba(255,83,11,0.1)]"
                          : "border-neutral-700 bg-[#141414] hover:border-neutral-500 hover:bg-[#1a1a1a] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                      }`}
                    >
                      <div
                        className={`rounded-lg p-1.5 transition-colors ${
                          isSelected ? "bg-[var(--ember)]/20 text-[var(--ember)]" : "bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        <Icon size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{opt.label}</div>
                        <div className="text-xs text-neutral-500">{opt.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <FieldRow label="Time window">
                <CustomSelect
                  label="Time window"
                  placeholder="Choose a window"
                  value={windowOption(automation.window)?.value ?? ""}
                  onChange={(value) => updateListens({ window: WINDOW_OPTIONS.find((o) => o.value === value).window })}
                  options={WINDOW_OPTIONS}
                />
              </FieldRow>
            </SectionCard>

            <SectionCard title="Schedule" icon={IconCalendarRepeat} delay={0.3}>
              <CronEditor value={automation.cron || ""} onChange={updateCron} />
            </SectionCard>

            <SectionCard title="Filters" icon={IconFilter} delay={0.4}>
              <FilterBuilder
                value={automation.filterGroups || []}
                onChange={updateFilters}
              />
            </SectionCard>

            <SectionCard title="Run history" icon={IconHistory} delay={0.5}>
              <div className="flex items-center gap-3">
                <Button
                  size="default"
                  onClick={handleRunNow}
                  disabled={runningNow || listensLoading}
                  className="shrink-0"
                >
                  {runningNow ? (
                    <IconRefresh size={16} className="animate-spin" />
                  ) : (
                    <IconPlayerPlay size={16} />
                  )}
                  {runningNow ? "Running..." : unsavedChanges ? "Save & run" : "Run now"}
                </Button>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {runHint}
                </p>
              </div>

              <ProgressBar progress={runProgress} />

              {runError && (
                <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4 text-center">
                  <p className="text-sm text-red-400">{runError}</p>
                </div>
              )}

              {historyLoading && (
                <p className="text-sm text-neutral-500">Loading run history...</p>
              )}

              {historyError && (
                <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4 text-center">
                  <p className="text-sm text-red-400">{historyError}</p>
                </div>
              )}

              {!historyLoading && !historyError && history.length === 0 && (
                <p className="text-sm text-neutral-500">
                  No runs yet. Use Run now or wait for the schedule.
                </p>
              )}

              <div className="space-y-2">
                {history.map((entry) => {
                  const expanded = expandedId === entry.id;
                  const tracks = entryTracks[entry.id];
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-neutral-800 bg-[#141414] overflow-hidden"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleEntry(entry)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleEntry(entry);
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDot(entry.status)}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white font-medium truncate">
                            {entry.status} · {formatRunDate(entry.scheduled_for || entry.started_at)}
                            {(entry.attempt || 1) > 1 && ` · attempt ${entry.attempt}/${MAX_ATTEMPT}`}
                          </div>
                          <div className="text-xs text-neutral-500 tabular-nums">
                            {entry.tracks_after_filter} of {entry.tracks_before_filter} tracks kept
                            {entry.generated_playlist_id ? " · click for track list" : ""}
                            {entry.status === "failed" &&
                              (entry.attempt || 1) < MAX_ATTEMPT &&
                              " · automatic retry scheduled"}
                          </div>
                          {entry.status === "failed" && entry.error_message && (
                            <div className="text-xs text-red-400 truncate mt-0.5">
                              {entry.error_message}
                            </div>
                          )}
                        </div>
                        {entry.status === "failed" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunNow();
                            }}
                            disabled={runningNow || listensLoading}
                            className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-white hover:border-[var(--ember)] hover:text-[var(--ember)] transition-colors disabled:opacity-40"
                          >
                            {runningNow ? "Running..." : unsavedChanges ? "Save & run" : "Re-run"}
                          </button>
                        )}
                      </div>
                      {expanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-neutral-800/60">
                          {scheduledDiffers(entry) && (
                            <p className="text-xs text-neutral-500 mt-2">
                              Scheduled {formatRunDate(entry.scheduled_for)} · started{" "}
                              {formatRunDate(entry.started_at)}
                            </p>
                          )}
                          {entry.completed_at && (() => {
                            const duration = formatRunDuration(entry.started_at, entry.completed_at);
                            return (
                              <p className="text-xs text-neutral-500 mt-2">
                                Finished {formatRunDate(entry.completed_at)}
                                {duration && ` (took ${duration})`}
                              </p>
                            );
                          })()}
                          {entry.status === "failed" && entry.error_message && (
                            <p className="text-xs text-red-400 mt-2 break-words">
                              {entry.error_message}
                            </p>
                          )}
                          {entry.status === "failed" &&
                            (entry.attempt || 1) >= MAX_ATTEMPT && (
                              <p className="text-xs text-neutral-500 mt-2">
                                No more automatic retries — use Re-run for a fresh attempt.
                              </p>
                            )}
                          {tracksLoadingId === entry.id && (
                            <p className="text-xs text-neutral-500 mt-2">Loading tracks...</p>
                          )}
                          {tracks && tracks.length > 0 && (
                            <ol className="mt-2 space-y-0.5">
                              {tracks.map((t) => (
                                <li
                                  key={`${t.position}-${t.artist}-${t.title}`}
                                  className="flex items-baseline gap-3 text-sm"
                                >
                                  <span className="text-xs text-neutral-600 font-mono w-6 text-right shrink-0 tabular-nums">
                                    {t.position + 1}
                                  </span>
                                  <span className="text-white/90 truncate">{t.title}</span>
                                  <span className="text-xs text-neutral-500 truncate italic">
                                    {t.artist}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                          {tracks && tracks.length === 0 && tracksLoadingId !== entry.id && (
                            <p className="text-xs text-neutral-500 mt-2">
                              {entry.generated_playlist_id
                                ? "No tracks stored for this run."
                                : "No playlist stored for this run."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <div className="lg:sticky lg:top-8">
            <motion.div
              className="flex flex-col"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <BorderGlow
                edgeSensitivity={30}
                glowColor="40 80 80"
                backgroundColor="#000000"
                borderRadius={28}
                glowRadius={40}
                glowIntensity={1}
                coneSpread={25}
                animated
                colors={GLOW_COLORS}
                className="flex flex-col"
              >
                <div className="flex flex-col max-h-[calc(100vh-8rem)]">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-[var(--ember)]/10 p-2">
                        <IconEye size={16} className="text-[var(--ember)]" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Preview</h3>
                    </div>
                  </div>

                  <div className="p-5 space-y-3 shrink-0 border-b border-white/5">
                    <Button
                      size="lg"
                      onClick={loadPreview}
                      disabled={previewLoading || !username?.trim()}
                      className="w-full"
                    >
                      {previewLoading ? (
                        <IconRefresh size={16} className="animate-spin" />
                      ) : (
                        <IconPlayerPlay size={16} />
                      )}
                      {previewTracks ? "Refresh" : "Load"}
                    </Button>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      What a run would produce now, from your stored listens.
                    </p>
                    {preview && (
                      <p className="text-sm text-neutral-300 tabular-nums">
                        {preview.before_filter} in window → {preview.after_filter} match filters →{" "}
                        <span className="text-white font-semibold">{preview.total} in playlist</span>
                      </p>
                    )}
                    {preview && usesTagFilter(automation.filterGroups) &&
                      preview.known_tag_artists < preview.window_artists && (
                        <p className="text-xs text-neutral-500 leading-relaxed">
                          Tags known for {preview.known_tag_artists} of {preview.window_artists} artists so far.
                          The others match no tag filter yet.
                        </p>
                      )}
                    {previewStale && (
                      <p className="text-xs font-medium text-amber-400" role="status">
                        Settings changed. Refresh to update this preview.
                      </p>
                    )}
                    <ProgressBar progress={previewProgress} onCancel={handleCancelPreview} />
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 min-h-0">
                    {previewLoading && (
                      <div className="flex items-center justify-center py-12">
                        <Loader />
                      </div>
                    )}

                    {previewError && (
                      <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4 text-center">
                        <p className="text-sm text-red-400">{previewError}</p>
                      </div>
                    )}

                    {!previewLoading && !previewError && !previewTracks && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="rounded-2xl bg-neutral-800/40 p-4 mb-4">
                          <IconEye size={28} className="text-neutral-600" />
                        </div>
                        <p className="text-sm text-neutral-500 font-medium">
                          Click <span className="text-[var(--ember)]">Load</span> to preview
                        </p>
                        <p className="text-xs text-neutral-600 mt-1">
                          See what this automation produces right now
                        </p>
                      </div>
                    )}

                    {previewTracks && previewTracks.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="rounded-2xl bg-neutral-800/40 p-4 mb-4">
                          <IconMusic size={28} className="text-neutral-600" />
                        </div>
                        <p className="text-sm text-neutral-500 font-medium">No tracks found</p>
                        <p className="text-xs text-neutral-600 mt-1">
                          Try a wider window or looser filters
                        </p>
                      </div>
                    )}

                    {previewTracks && previewTracks.length > 0 && (
                      <div className={`space-y-0.5 ${previewStale ? "opacity-40" : ""}`}>
                        {previewTracks.map((track, i) => {
                          const lastfmUrl = `https://www.last.fm/music/${encodeURIComponent(track.artist)}/_/${encodeURIComponent(track.title)}`;
                          return (
                            <motion.a
                              key={`${track.artist}-${track.title}-${i}`}
                              href={lastfmUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2, delay: Math.min(i, 15) * 0.03 }}
                              className="flex items-center gap-4 rounded-lg px-4 py-3 hover:bg-white/5 transition-colors group"
                            >
                              <span className="text-xs text-neutral-600 font-mono w-6 text-right shrink-0 group-hover:text-neutral-400 tabular-nums">
                                {i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-base text-white/90 truncate group-hover:text-[#17AEFF] transition-colors">
                                  {track.title}
                                </div>
                                <div className="text-xs text-neutral-500 truncate italic group-hover:text-neutral-400 transition-colors">
                                  {track.artist}
                                </div>
                              </div>
                              {track.playcount != null && (
                                <span className="text-xs text-neutral-600 font-mono shrink-0 tabular-nums">
                                  {track.playcount}
                                </span>
                              )}
                            </motion.a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </BorderGlow>
            </motion.div>
          </div>
        </div>

        <Modal
          open={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Delete automation"
          description={`Are you sure you want to delete ${automation.name || "this automation"}? This action cannot be undone.`}
        >
          <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={confirmDelete} disabled={deleting}>
            <IconTrash size={14} />
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </Modal>

      </div>
    </main>
  );
}
