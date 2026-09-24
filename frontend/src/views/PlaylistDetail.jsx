import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconTrash,
  IconPlayerPlay,
  IconRefresh,
  IconBolt,
  IconHeart,
  IconClock,
  IconUsers,
  IconCalendarRepeat,
  IconSettings,
  IconEye,
  IconMusic,
  IconFilter,
  IconHistory,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
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
} from "@/lib/api";
import { useAutomation } from "@/hooks/useAutomation";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
} from "@/lib/automation-rules";
import { applyFilters } from "@/lib/filter-engine";
import { useAuth } from "../contexts/AuthContext";

const SOURCE_OPTIONS = [
  { type: SOURCE_TYPES.TOP_TRACKS, icon: IconBolt, description: "Most played tracks" },
  { type: SOURCE_TYPES.RECENT_TRACKS, icon: IconClock, description: "Recent listens" },
  { type: SOURCE_TYPES.LOVED_TRACKS, icon: IconHeart, description: "Loved tracks" },
  { type: SOURCE_TYPES.TOP_ARTISTS, icon: IconUsers, description: "From favorite artists" },
];

const GLOW_COLORS = ["#c084fc", "#f472b6", "#38bdf8"];

function SectionCard({ title, icon, children, delay = 0 }) {
  const IconComp = icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
    >
      <div className="rounded-2xl border border-neutral-800 bg-[#1a1a1a] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:border-neutral-700 transition-colors">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800/80">
          <div className="rounded-lg bg-[#ff530b]/10 p-2">
            <IconComp size={16} className="text-[#ff530b]" />
          </div>
          <h3 className="text-base font-bold text-white">{title}</h3>
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

function dedupeTags(tracks, field) {
  return Object.values(
    tracks
      .flatMap((t) => t[field] || [])
      .reduce((acc, tag) => {
        const key = tag.name.toLowerCase();
        if (!acc[key] || tag.count > acc[key].count) {
          acc[key] = { name: tag.name.toLowerCase(), count: tag.count };
        }
        return acc;
      }, {})
  ).sort((a, b) => b.count - a.count);
}

function applyFilterGroups(tracks, groups) {
  const hasFilters =
    groups &&
    groups.length > 0 &&
    groups.some((g) => g.conditions && g.conditions.length > 0);
  return hasFilters ? applyFilters(tracks, groups) : tracks;
}

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const username = user?.lastfm_username;

  const {
    automation: loadedAutomation,
    error: automationError,
  } = useAutomation(username && id ? id : null);

  const [automation, setAutomation] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [rawTracks, setRawTracks] = useState(null);
  const [previewTracks, setPreviewTracks] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [runningNow, setRunningNow] = useState(false);
  const [runError, setRunError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [entryTracks, setEntryTracks] = useState({});
  const [tracksLoadingId, setTracksLoadingId] = useState(null);

  useEffect(() => {
    document.title = automation?.name ? `${automation.name} - ListFM` : "Playlist - ListFM";
  }, [automation?.name]);

  useEffect(() => {
    if (loadedAutomation) {
      setAutomation(loadedAutomation);
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

  const updateSource = useCallback((patch) => {
    setAutomation((prev) => ({
      ...prev,
      source: { ...prev.source, ...patch },
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

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateAutomation(automation.id, automation);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save automation:", err);
      setSaveError(err.message || "Failed to save automation");
    } finally {
      setSaving(false);
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

  const handleRunNow = async () => {
    if (runningNow) return;
    setRunningNow(true);
    setRunError(null);
    try {
      await runAutomationNow(id);
      await loadHistory();
    } catch (err) {
      setRunError(err.message || "Failed to run automation");
    } finally {
      setRunningNow(false);
    }
  };

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
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewTracks(null);
    setRawTracks(null);
    try {
      const data = await previewAutomation(automation);
      const enriched = data.tracks || [];
      setRawTracks(enriched);
      const filtered = applyFilterGroups(enriched, automation.filterGroups);
      setPreviewTracks(filtered);
    } catch (err) {
      setPreviewError(err.message || "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!rawTracks) return;
    setPreviewTracks(applyFilterGroups(rawTracks, automation?.filterGroups));
  }, [automation?.filterGroups, rawTracks]);

  const availableTags = useMemo(
    () =>
      rawTracks
        ? { artist: dedupeTags(rawTracks, "artist_tags"), album: dedupeTags(rawTracks, "album_tags") }
        : { artist: [], album: [] },
    [rawTracks]
  );

  if (notFound) {
    return (
      <div className="h-screen w-full min-w-0 flex-1 overflow-y-auto bg-[#121212] p-5 md:p-10">
        <div className="mx-auto max-w-3xl text-center py-20">
          <div className="rounded-2xl bg-neutral-800/40 p-4 mb-6 inline-flex">
            <IconMusic size={32} className="text-neutral-600" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Automation not found</h2>
          <p className="text-neutral-400 mb-6">
            This automation may have been deleted or the link is invalid.
          </p>
          <Button onClick={() => navigate("/playlists")} className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90">
            Back to playlists
          </Button>
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="h-screen w-full min-w-0 flex-1 bg-[#121212] flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  const sourceLabel = SOURCE_TYPE_LABELS[automation.source?.type] || automation.source?.type;
  const periodLabel =
    PERIOD_OPTIONS.find((p) => p.value === automation.source?.period)?.label ||
    automation.source?.period;

  return (
    <div className="h-screen w-full min-w-0 flex-1 overflow-y-auto bg-[#121212] p-5 md:p-10">
      <div className="mx-auto max-w-[1400px]">
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
                {sourceLabel} · {periodLabel}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                className="border-red-900/50 bg-transparent text-red-400 hover:bg-red-950 hover:text-red-300"
              >
                <IconTrash size={14} className="mr-1.5" />
                Delete
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90 shadow-[0_4px_14px_rgba(255,83,11,0.3)]"
              >
                {saving ? (
                  "Saving..."
                ) : saved ? (
                  "Saved!"
                ) : (
                  <>
                    <IconDeviceFloppy size={14} className="mr-1.5" />
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
                  className="w-full rounded-xl border border-neutral-700 bg-[#141414] px-4 py-3.5 text-base text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-all shadow-inner"
                />
              </FieldRow>
              <FieldRow label="Description">
                <textarea
                  value={automation.description || ""}
                  onChange={(e) => update({ description: e.target.value })}
                  rows={2}
                  placeholder="Optional description"
                  className="w-full rounded-xl border border-neutral-700 bg-[#141414] px-4 py-3.5 text-base text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-all resize-none shadow-inner"
                />
              </FieldRow>
            </SectionCard>

            <SectionCard title="Source" icon={IconMusic} delay={0.2}>
              <div className="grid grid-cols-2 gap-3">
                {SOURCE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = automation.source?.type === opt.type;
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => updateSource({ type: opt.type })}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all ${
                        isSelected
                          ? "border-[#ff530b] bg-[#ff530b]/10 shadow-[0_0_20px_rgba(255,83,11,0.1)]"
                          : "border-neutral-700 bg-[#141414] hover:border-neutral-500 hover:bg-[#1a1a1a] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                      }`}
                    >
                      <div
                        className={`rounded-lg p-1.5 transition-colors ${
                          isSelected ? "bg-[#ff530b]/20 text-[#ff530b]" : "bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        <Icon size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{SOURCE_TYPE_LABELS[opt.type]}</div>
                        <div className="text-xs text-neutral-500">{opt.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <FieldRow label="Time period">
                <select
                  value={automation.source?.period || "3m"}
                  onChange={(e) => updateSource({ period: e.target.value })}
                  className="w-full rounded-xl border border-neutral-700 bg-[#141414] px-4 py-3.5 text-base text-white focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-all appearance-none shadow-inner"
                >
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
            </SectionCard>

            <SectionCard title="Schedule" icon={IconCalendarRepeat} delay={0.3}>
              <CronEditor value={automation.cron || ""} onChange={updateCron} />
            </SectionCard>

            <SectionCard title="Filters" icon={IconFilter} delay={0.4}>
              <FilterBuilder
                value={automation.filterGroups || []}
                onChange={updateFilters}
                availableTags={availableTags}
                disabledFields={automation.source?.type !== "recent_tracks" ? ["timestamp"] : []}
              />
            </SectionCard>

            <SectionCard title="Run history" icon={IconHistory} delay={0.5}>
              <div className="flex items-center gap-3">
                <Button
                  size="default"
                  onClick={handleRunNow}
                  disabled={runningNow}
                  className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90 disabled:opacity-40 shrink-0 shadow-[0_4px_14px_rgba(255,83,11,0.3)]"
                >
                  {runningNow ? (
                    <IconRefresh size={16} className="animate-spin mr-1.5" />
                  ) : (
                    <IconPlayerPlay size={16} className="mr-1.5" />
                  )}
                  {runningNow ? "Running..." : "Run now"}
                </Button>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Trigger this automation immediately. The run is recorded below with its frozen track list.
                </p>
              </div>

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
                      <button
                        type="button"
                        onClick={() => toggleEntry(entry)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
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
                            disabled={runningNow}
                            className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-white hover:border-[#ff530b] hover:text-[#ff530b] transition-colors disabled:opacity-40"
                          >
                            {runningNow ? "Running..." : "Re-run"}
                          </button>
                        )}
                      </button>
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
                      <div className="rounded-lg bg-[#ff530b]/10 p-2">
                        <IconEye size={16} className="text-[#ff530b]" />
                      </div>
                      <h3 className="text-base font-bold text-white">Preview</h3>
                    </div>
                  </div>

                  <div className="p-5 space-y-3 shrink-0 border-b border-white/5">
                    <FieldRow label="Last.fm username">
                      <div className="flex gap-2.5">
                        <div className="flex-1 h-12 rounded-xl border border-neutral-700 bg-[#141414] px-4 flex items-center text-base text-white/70 shadow-inner">
                          {username || "Not linked"}
                        </div>
                        <Button
                          size="default"
                          onClick={loadPreview}
                          disabled={previewLoading || !username?.trim()}
                          className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90 disabled:opacity-40 shrink-0 shadow-[0_4px_14px_rgba(255,83,11,0.3)] px-5 h-12"
                        >
                          {previewLoading ? (
                            <IconRefresh size={16} className="animate-spin" />
                          ) : (
                            <IconPlayerPlay size={16} className="mr-1.5" />
                          )}
                          {previewTracks ? "Refresh" : "Load"}
                        </Button>
                      </div>
                    </FieldRow>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      One API call to Last.fm. Limited to your configured max tracks.
                      {rawTracks && previewTracks && rawTracks.length !== previewTracks.length && (
                        <span className="block mt-1 text-[#ff530b]">
                          {previewTracks.length} of {rawTracks.length} tracks match filters
                        </span>
                      )}
                    </p>
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
                          Click <span className="text-[#ff530b]">Load</span> to preview
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
                          Try adjusting your filters or source settings
                        </p>
                      </div>
                    )}

                    {previewTracks && previewTracks.length > 0 && (
                      <div className="space-y-0.5">
                        {previewTracks.slice(0, 15).map((track, i) => {
                          const lastfmUrl = `https://www.last.fm/music/${encodeURIComponent(track.artist)}/_/${encodeURIComponent(track.title)}`;
                          return (
                            <motion.a
                              key={`${track.artist}-${track.title}-${i}`}
                              href={lastfmUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2, delay: i * 0.03 }}
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

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-sm rounded-2xl border border-neutral-700 bg-[#1a1a1a] shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-red-500/10 p-2">
                  <IconTrash size={18} className="text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Delete automation</h3>
              </div>
              <p className="text-sm text-neutral-400 mb-6">
                Are you sure you want to delete <span className="text-white font-medium">{automation.name || "this automation"}</span>? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  <IconTrash size={14} className="mr-1.5" />
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}

      </div>
    </div>
  );
}
