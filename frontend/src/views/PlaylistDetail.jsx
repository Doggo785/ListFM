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
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import BorderGlow from "@/components/ui/BorderGlow";
import Loader from "@/components/elements/Loader";
import FilterBuilder from "@/components/builder/FilterBuilder";
import CronEditor from "@/components/builder/CronEditor";
import {
  previewAutomation,
  saveGeneratedPlaylist,
  getAutomation,
  updateAutomation,
  deleteAutomation,
} from "@/lib/api";
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

  const [automation, setAutomation] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [saveName, setSaveName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [rawTracks, setRawTracks] = useState(null);
  const [previewTracks, setPreviewTracks] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    document.title = automation?.name ? `${automation.name} - ListFM` : "Playlist - ListFM";
  }, [automation?.name]);

  useEffect(() => {
    const loadAutomation = async () => {
      if (!username || !id) return;
      try {
        const found = await getAutomation(id);
        setAutomation(found);
      } catch {
        setNotFound(true);
      }
    };
    loadAutomation();
  }, [id, username]);

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
    try {
      await updateAutomation(automation.id, automation);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save automation:", err);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteAutomation(automation.id);
      navigate("/playlists");
    } catch (err) {
      console.error("Failed to delete automation:", err);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!saveName.trim() || !previewTracks) return;
    try {
      await saveGeneratedPlaylist({
        automation_id: automation.id,
        name: saveName.trim(),
        source_type: automation.source?.type,
        source_period: automation.source?.period,
        tracks: previewTracks,
        track_count: previewTracks.length,
        filter_groups: automation.filterGroups || [],
      });
      setShowSaveModal(false);
      setSaveName("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save playlist:", err);
    }
  };

  const loadPreview = async () => {
    if (!username?.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewTracks(null);
    setRawTracks(null);
    try {
      const data = await previewAutomation(automation);
      if (data.error) {
        setPreviewError(data.error);
      } else {
        const enriched = data.tracks || [];
        setRawTracks(enriched);
        const filtered = applyFilterGroups(enriched, automation.filterGroups);
        setPreviewTracks(filtered);

        // Auto-save to library (fire-and-forget)
        saveGeneratedPlaylist({
          automation_id: automation.id,
          source_type: automation.source?.type,
          source_period: automation.source?.period,
          tracks: filtered,
          track_count: filtered.length,
          filter_groups: automation.filterGroups || [],
        }).catch(() => {}); // Silently fail — don't block UI
      }
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
                className="border-red-900/50 bg-transparent text-red-400 hover:bg-red-950 hover:text-red-300"
              >
                <IconTrash size={14} className="mr-1.5" />
                Delete
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90 shadow-[0_4px_14px_rgba(255,83,11,0.3)]"
              >
                {saved ? (
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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-8 items-start">
          {/* Left: Settings */}
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

                  {previewTracks && previewTracks.length > 0 && (
                    <div className="px-5 py-4 border-t border-white/5 shrink-0">
                      {saveSuccess ? (
                        <div className="text-center text-sm text-green-400 font-medium py-2">
                          Saved to library!
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowSaveModal(true)}
                          className="w-full rounded-xl bg-[#ff530b] text-white py-3 text-sm font-semibold hover:bg-[#ff530b]/90 transition-colors shadow-[0_4px_14px_rgba(255,83,11,0.3)]"
                        >
                          Save to Library
                        </button>
                      )}
                    </div>
                  )}
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
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  <IconTrash size={14} className="mr-1.5" />
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {showSaveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSaveModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-sm rounded-2xl border border-neutral-700 bg-[#1a1a1a] shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-lg bg-[#ff530b]/10 p-2">
                  <IconDeviceFloppy size={18} className="text-[#ff530b]" />
                </div>
                <h3 className="text-lg font-bold text-white">Save to Library</h3>
              </div>
              <p className="text-sm text-neutral-400 mb-4">
                Give your playlist a name to find it later.
              </p>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Summer Vibes 2024"
                className="w-full rounded-xl border border-neutral-700 bg-[#141414] px-4 py-3 text-base text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-all shadow-inner mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveToLibrary();
                  if (e.key === "Escape") setShowSaveModal(false);
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSaveModal(false)}
                  className="border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveToLibrary}
                  disabled={!saveName.trim()}
                  className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <IconDeviceFloppy size={14} className="mr-1.5" />
                  Save
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
