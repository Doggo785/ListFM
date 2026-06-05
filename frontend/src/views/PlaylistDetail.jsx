import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
// eslint-disable-next-line no-unused-vars -- motion is used as JSX (<motion.div>)
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
import { previewAutomation } from "@/lib/api";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
} from "@/lib/automation-rules";
import { applyFilters } from "@/lib/filter-engine";

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
      <div className="rounded-2xl border border-neutral-800 bg-[#1a1a1a] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
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
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [automation, setAutomation] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [rawTracks, setRawTracks] = useState(null);
  const [previewTracks, setPreviewTracks] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const [username, setUsername] = useState(() => localStorage.getItem("listfm_username") || "");

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("listfm_automations") || "[]");
    const found = stored.find((a) => a.id === id);
    if (found) {
      setAutomation(found);
    } else {
      setNotFound(true);
    }
  }, [id]);

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

  const handleSave = () => {
    const stored = JSON.parse(localStorage.getItem("listfm_automations") || "[]");
    const updated = stored.map((a) => (a.id === automation.id ? automation : a));
    localStorage.setItem("listfm_automations", JSON.stringify(updated));
    if (username) localStorage.setItem("listfm_username", username);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const confirmDelete = () => {
    const stored = JSON.parse(localStorage.getItem("listfm_automations") || "[]");
    const updated = stored.filter((a) => a.id !== automation.id);
    localStorage.setItem("listfm_automations", JSON.stringify(updated));
    navigate("/playlists");
  };

  const loadPreview = async () => {
    if (!username.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewTracks(null);
    setRawTracks(null);
    try {
      const data = await previewAutomation(username.trim(), automation);
      if (data.error) {
        setPreviewError(data.error);
      } else {
        const enriched = data.tracks || [];
        setRawTracks(enriched);
        const groups = automation.filterGroups;
        const hasFilters = groups && groups.length > 0 &&
          groups.some(g => g.conditions && g.conditions.length > 0);
        if (hasFilters) {
          setPreviewTracks(applyFilters(enriched, groups));
        } else {
          setPreviewTracks(enriched);
        }
      }
    } catch (err) {
      setPreviewError(err.message || "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!rawTracks) return;
    const groups = automation?.filterGroups;
    const hasFilters = groups && groups.length > 0 &&
      groups.some(g => g.conditions && g.conditions.length > 0);
    if (hasFilters) {
      setPreviewTracks(applyFilters(rawTracks, groups));
    } else {
      setPreviewTracks(rawTracks);
    }
  }, [automation?.filterGroups, rawTracks]);

  if (notFound) {
    return (
      <div className="main-content h-screen w-full min-w-0 flex-1 overflow-y-auto p-5 md:p-10">
        <div className="mx-auto max-w-3xl text-center py-20">
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

  const availableTags = rawTracks
    ? {
        artist: Object.values(
          rawTracks
            .flatMap((t) => t.artist_tags || [])
            .reduce((acc, tag) => {
              const key = tag.name.toLowerCase();
              if (!acc[key] || tag.count > acc[key].count) {
                acc[key] = { name: tag.name.toLowerCase(), count: tag.count };
              }
              return acc;
            }, {})
        ).sort((a, b) => b.count - a.count),
        album: Object.values(
          rawTracks
            .flatMap((t) => t.album_tags || [])
            .reduce((acc, tag) => {
              const key = tag.name.toLowerCase();
              if (!acc[key] || tag.count > acc[key].count) {
                acc[key] = { name: tag.name.toLowerCase(), count: tag.count };
              }
              return acc;
            }, {})
        ).sort((a, b) => b.count - a.count),
      }
    : { artist: [], album: [] };

  return (
    <div className="main-content h-screen w-full min-w-0 flex-1 overflow-y-auto p-6 md:p-12">
      <div className="mx-auto max-w-[1400px] flex h-full flex-col">
        {/* Header */}
        <motion.header
          className="mb-10 shrink-0"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <button
            type="button"
            onClick={() => navigate("/playlists")}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm mb-4"
          >
            <IconArrowLeft size={16} />
            Back to playlists
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-white">
                <span className="text-[#17AEFF]">Edit</span> automation
              </h2>
              <p className="mt-1 text-neutral-400 text-sm">
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

        {/* Content: two columns on large screens */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_520px] gap-8">
          {/* Left: Settings */}
          <div className="space-y-6 overflow-y-auto pr-2 pb-4">
            {/* Identity */}
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

            {/* Source */}
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
                          : "border-neutral-700 bg-[#141414] hover:border-neutral-500 hover:bg-[#1a1a1a]"
                      }`}
                    >
                      <div
                        className={`rounded-lg p-1.5 ${
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

            {/* Schedule */}
            <SectionCard title="Schedule" icon={IconCalendarRepeat} delay={0.3}>
              <CronEditor value={automation.cron || ""} onChange={updateCron} />
            </SectionCard>

            {/* Filters */}
            <SectionCard title="Filters" icon={IconFilter} delay={0.4}>
              <FilterBuilder
                value={automation.filterGroups || []}
                onChange={updateFilters}
                availableTags={availableTags}
                disabledFields={automation.source?.type !== "recent_tracks" ? ["timestamp"] : []}
              />
            </SectionCard>
          </div>

          {/* Right: Preview */}
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
              className="flex flex-col h-full"
            >
              <div className="flex flex-col h-full min-h-[600px]">
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
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. john_doe"
                        className="flex-1 h-12 rounded-xl border border-neutral-700 bg-[#141414] px-4 text-base text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-all shadow-inner"
                      />
                      <Button
                        size="default"
                        onClick={loadPreview}
                        disabled={previewLoading || !username.trim()}
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

                {/* Track list */}
                <div className="flex-1 overflow-y-auto p-5">
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
                    <div className="text-center py-12">
                      <p className="text-sm text-neutral-500">No tracks found</p>
                    </div>
                  )}

                  {previewTracks && previewTracks.length > 0 && (
                    <div className="space-y-0.5">
                      {previewTracks.slice(0, 15).map((track, i) => (
                        <div
                          key={`${track.artist}-${track.title}-${i}`}
                          className="flex items-center gap-4 rounded-lg px-4 py-3 hover:bg-white/5 transition-colors group"
                        >
                          <span className="text-xs text-neutral-600 font-mono w-6 text-right shrink-0 group-hover:text-neutral-400 tabular-nums">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-base text-white/90 truncate group-hover:text-white transition-colors">
                              {track.title}
                            </div>
                            <div className="text-xs text-neutral-500 truncate italic">
                              {track.artist}
                            </div>
                          </div>
                          {track.playcount != null && (
                            <span className="text-xs text-neutral-600 font-mono shrink-0 tabular-nums">
                              {track.playcount}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </BorderGlow>
          </motion.div>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <div className="relative z-10 w-full max-w-sm rounded-2xl border border-neutral-700 bg-[#1a1a1a] shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
