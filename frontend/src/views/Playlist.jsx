import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconArrowLeft,
  IconCheck,
  IconPlus,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import TiltedCard from "../components/ui/PlaylistCard";
import BorderGlow from "../components/ui/BorderGlow";

const SOURCE_TYPES = [
  {
    value: "top_tracks",
    label: "Top Tracks",
    note: "Construire depuis vos titres les plus écoutés.",
  },
  {
    value: "top_artists",
    label: "Top Artists + Top Tracks",
    note: "Prend vos artistes favoris puis leurs meilleurs morceaux.",
  },
  {
    value: "loved_tracks",
    label: "Loved Tracks",
    note: "Part de vos coups de coeur marqués sur Last.fm.",
  },
  {
    value: "recent_tracks",
    label: "Recent Tracks",
    note: "Analyse votre flux d'ecoute recent.",
  },
];

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 jours" },
  { value: "1m", label: "1 mois" },
  { value: "3m", label: "3 mois" },
  { value: "6m", label: "6 mois" },
  { value: "12m", label: "1 an" },
  { value: "overall", label: "Global" },
  { value: "custom", label: "Date de debut / fin" },
];

const PRESETS = [
  {
    key: "forgotten_favorites",
    title: "Forgotten Favorites",
    description: "> 50 ecoutes historiques, 0 ecoute sur les 6 derniers mois.",
  },
  {
    key: "obsessions",
    title: "Obsessions (On Repeat)",
    description: "Pic massif sur les 3 derniers jours (> 20 scrobbles).",
  },
  {
    key: "deep_cuts",
    title: "Deep Cuts",
    description:
      "Top artists puis morceaux peu populaires ou jamais scrobbles.",
  },
  {
    key: "artist_radar",
    title: "Artist Radar",
    description: "Nouveaux artistes ecoutes pour la premiere fois ce mois-ci.",
  },
];

const SORT_OPTIONS = [
  { value: "playcount_desc", label: "Playcount decroissant" },
  { value: "playcount_asc", label: "Playcount croissant" },
  { value: "last_scrobble_desc", label: "Dernier scrobble recent -> ancien" },
  { value: "last_scrobble_asc", label: "Dernier scrobble ancien -> recent" },
  { value: "shuffle", label: "Shuffle algorithmique" },
];

const WEEKLY_DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

const MONTHLY_DAYS = Array.from({ length: 28 }, (_, idx) => String(idx + 1));

const DEFAULT_FORM = {
  title: "",
  sourceType: "top_tracks",
  period: "3m",
  customStart: "",
  customEnd: "",
  seedTags: ["indie", "alt-rock"],
  seedArtists: [],
  minScrobbles: "10",
  maxScrobbles: "",
  blacklistArtists: [],
  blacklistTags: [],
  freshnessDays: "14",
  presets: [],
  playlistSize: "50",
  sortMethod: "playcount_desc",
  frequency: "weekly",
  weeklyDay: "Lundi",
  monthlyDay: "1",
  runHour: "08:00",
  targetAction: "dashboard_cache",
};

const INITIAL_AUTOMATIONS = [
  {
    id: "auto-1",
    title: "Weekly Discovery Sync",
    image: "https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58",
    description: "Saves your weekly discovery radar every Monday.",
    generatedPlaylists: [
      { id: "p1", name: "Discovery - Week 42", tracks: 30, date: "2023-10-16" },
      { id: "p2", name: "Discovery - Week 41", tracks: 30, date: "2023-10-09" },
      { id: "p3", name: "Discovery - Week 40", tracks: 30, date: "2023-10-02" },
    ],
  },
];

function listToSentence(values) {
  if (!values.length) {
    return "aucun";
  }
  return values.join(", ");
}

function ChipInput({ label, helper, placeholder, values, onAdd, onRemove }) {
  const [draft, setDraft] = useState("");

  const addChip = () => {
    const cleanValue = draft.trim();
    if (!cleanValue) {
      return;
    }
    onAdd(cleanValue);
    setDraft("");
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-neutral-200">
        {label}
      </label>
      {helper ? (
        <p className="mb-3 text-xs text-neutral-500">{helper}</p>
      ) : null}
      <div className="rounded-xl border border-neutral-700 bg-[#141414] p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {values.length ? (
            values.map((value) => (
              <span
                key={`${label}-${value}`}
                className="inline-flex items-center gap-2 rounded-full border border-[#17AEFF]/40 bg-[#17AEFF]/10 px-3 py-1 text-xs font-semibold text-[#9be0ff]"
              >
                {value}
                <button
                  type="button"
                  className="rounded-full p-0.5 text-[#9be0ff] transition-colors hover:bg-[#17AEFF]/30"
                  onClick={() => onRemove(value)}
                  aria-label={`Supprimer ${value}`}
                >
                  <IconX size={12} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-neutral-500">
              Aucune valeur ajoutee.
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addChip();
              }
            }}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-neutral-700 bg-[#1b1b1b] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[#17AEFF]"
          />
          <button
            type="button"
            onClick={addChip}
            className="inline-flex items-center gap-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ff530b]"
          >
            <IconPlus size={14} />
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Playlist() {
  const [automations, setAutomations] = useState(INITIAL_AUTOMATIONS);
  const [selectedAuto, setSelectedAuto] = useState(null);
  const [showGeneratedPlaylists, setShowGeneratedPlaylists] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editorMode, setEditorMode] = useState("guided");
  const [form, setForm] = useState(DEFAULT_FORM);

  const summary = useMemo(() => {
    const source = SOURCE_TYPES.find(
      (item) => item.value === form.sourceType,
    )?.label;
    const period = PERIOD_OPTIONS.find(
      (item) => item.value === form.period,
    )?.label;
    const sort = SORT_OPTIONS.find(
      (item) => item.value === form.sortMethod,
    )?.label;

    return [
      `Source: ${source}`,
      `Periode: ${period}`,
      `Seeds tags: ${listToSentence(form.seedTags)}`,
      `Seeds artistes: ${listToSentence(form.seedArtists)}`,
      `Filtres: min ${form.minScrobbles || "-"} / max ${form.maxScrobbles || "-"}`,
      `Exclusions artistes: ${listToSentence(form.blacklistArtists)}`,
      `Exclusions tags: ${listToSentence(form.blacklistTags)}`,
      `Fraicheur: exclure les ${form.freshnessDays || "0"} derniers jours`,
      `Presets actifs: ${listToSentence(
        PRESETS.filter((preset) => form.presets.includes(preset.key)).map(
          (preset) => preset.title,
        ),
      )}`,
      `Sortie: ${form.playlistSize} titres, tri ${sort}`,
      `Regeneration: ${form.frequency} a ${form.runHour}`,
      `Action cible: ${form.targetAction}`,
    ];
  }, [form]);

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const togglePreset = (presetKey) => {
    setForm((prev) => ({
      ...prev,
      presets: prev.presets.includes(presetKey)
        ? prev.presets.filter((value) => value !== presetKey)
        : [...prev.presets, presetKey],
    }));
  };

  const addUniqueValue = (key, value) => {
    setForm((prev) => {
      if (prev[key].includes(value)) {
        return prev;
      }
      return { ...prev, [key]: [...prev[key], value] };
    });
  };

  const removeValue = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].filter((item) => item !== value),
    }));
  };

  const resetBuilder = () => {
    setForm(DEFAULT_FORM);
    setEditorMode("guided");
    setIsCreating(false);
  };

  const createAutomation = () => {
    const title = form.title.trim() || "Nouvelle automatisation";
    const activePresetCount = form.presets.length;
    const description = `${title}: ${form.playlistSize} titres, ${form.frequency}, ${activePresetCount} preset${
      activePresetCount > 1 ? "s" : ""
    }.`;

    const createdAutomation = {
      id: `auto-${Date.now()}`,
      title,
      image: "https://i.scdn.co/image/ab67616d0000b2734f5df8f5eddb8f4955f44f6f",
      description,
      generatedPlaylists: [],
      settings: form,
    };

    setAutomations((prev) => [createdAutomation, ...prev]);
    setSelectedAuto(createdAutomation);
    setShowGeneratedPlaylists(false);
    resetBuilder();
  };

  const selectedSourceNote =
    SOURCE_TYPES.find((item) => item.value === form.sourceType)?.note || "";

  return (
    <div className="h-screen w-full min-w-0 flex-1 overflow-y-auto bg-[#121212] p-5 md:p-10">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-4xl font-black text-white">
              <span className="text-[#17AEFF]">Automated</span> Playlists
            </h2>
            <p className="mt-2 text-neutral-400">
              Mode guide pour les debutants, mode expert pour pousser tous les
              reglages.
            </p>
          </div>
          {!isCreating && !selectedAuto ? (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff530b] px-5 py-3 text-sm font-black uppercase tracking-wide text-white transition-transform hover:translate-y-[-1px] hover:bg-[#ff6f2d]"
            >
              <IconSparkles size={17} />
              Nouvelle automatisation
            </button>
          ) : null}
        </header>

        <div className="relative flex-1">
          <AnimatePresence mode="wait">
            {isCreating ? (
              <motion.div
                key="builder"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
                className="grid h-full min-h-[calc(100vh-210px)] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"
              >
                <div className="overflow-y-auto rounded-3xl border border-neutral-800 bg-gradient-to-b from-[#181818] to-[#131313] p-5 md:p-7">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={resetBuilder}
                        className="rounded-full bg-neutral-800 p-2 text-white transition-colors hover:bg-[#ff530b]"
                      >
                        <IconArrowLeft size={20} />
                      </button>
                      <div>
                        <h3 className="text-2xl font-black text-white">
                          Creer une automatisation
                        </h3>
                        <p className="text-sm text-neutral-400">
                          Wizard complet avec tous les parametres metier.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-neutral-700 bg-[#101010] p-1 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setEditorMode("guided")}
                        className={`rounded-lg px-3 py-2 transition-colors ${
                          editorMode === "guided"
                            ? "bg-[#17AEFF] text-black"
                            : "text-neutral-300 hover:text-white"
                        }`}
                      >
                        Mode guide
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorMode("advanced")}
                        className={`rounded-lg px-3 py-2 transition-colors ${
                          editorMode === "advanced"
                            ? "bg-[#ff530b] text-white"
                            : "text-neutral-300 hover:text-white"
                        }`}
                      >
                        Mode avance
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <section className="rounded-2xl border border-neutral-800 bg-[#0f0f0f]/70 p-4 md:p-5">
                      <h4 className="mb-4 text-lg font-black text-white">
                        1. Source de donnees
                      </h4>
                      <div className="mb-4">
                        <label className="mb-2 block text-sm font-semibold text-neutral-200">
                          Nom de la regle
                        </label>
                        <input
                          value={form.title}
                          onChange={(event) =>
                            updateForm("title", event.target.value)
                          }
                          placeholder="Ex: Forgotten bangers du dimanche"
                          className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {SOURCE_TYPES.map((source) => (
                          <button
                            key={source.value}
                            type="button"
                            onClick={() =>
                              updateForm("sourceType", source.value)
                            }
                            className={`rounded-xl border p-4 text-left transition-colors ${
                              form.sourceType === source.value
                                ? "border-[#17AEFF] bg-[#17AEFF]/10"
                                : "border-neutral-700 bg-[#171717] hover:border-neutral-500"
                            }`}
                          >
                            <p className="font-semibold text-white">
                              {source.label}
                            </p>
                            <p className="mt-1 text-xs text-neutral-400">
                              {source.note}
                            </p>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-neutral-200">
                            Periode d'analyse
                          </label>
                          <select
                            value={form.period}
                            onChange={(event) =>
                              updateForm("period", event.target.value)
                            }
                            className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                          >
                            {PERIOD_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {form.period === "custom" ? (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Date debut
                              </label>
                              <input
                                type="date"
                                value={form.customStart}
                                onChange={(event) =>
                                  updateForm("customStart", event.target.value)
                                }
                                className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-3 py-2 text-white outline-none transition-colors focus:border-[#17AEFF]"
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Date fin
                              </label>
                              <input
                                type="date"
                                value={form.customEnd}
                                onChange={(event) =>
                                  updateForm("customEnd", event.target.value)
                                }
                                className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-3 py-2 text-white outline-none transition-colors focus:border-[#17AEFF]"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-neutral-800 bg-[#151515] p-4 text-sm text-neutral-400">
                            {selectedSourceNote}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <ChipInput
                          label="Seed Tags"
                          helper="Genres Last.fm de depart. Combine plusieurs ambiances."
                          placeholder="Ex: dream-pop"
                          values={form.seedTags}
                          onAdd={(value) => addUniqueValue("seedTags", value)}
                          onRemove={(value) => removeValue("seedTags", value)}
                        />
                        <ChipInput
                          label="Seed Artistes"
                          helper="Point de depart exclusif pour orienter l'algorithme."
                          placeholder="Ex: Massive Attack"
                          values={form.seedArtists}
                          onAdd={(value) =>
                            addUniqueValue("seedArtists", value)
                          }
                          onRemove={(value) =>
                            removeValue("seedArtists", value)
                          }
                        />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-neutral-800 bg-[#0f0f0f]/70 p-4 md:p-5">
                      <h4 className="mb-4 text-lg font-black text-white">
                        2. Filtres inclusion / exclusion
                      </h4>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-neutral-200">
                            Min scrobbles
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={form.minScrobbles}
                            onChange={(event) =>
                              updateForm("minScrobbles", event.target.value)
                            }
                            className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-neutral-200">
                            Max scrobbles
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={form.maxScrobbles}
                            onChange={(event) =>
                              updateForm("maxScrobbles", event.target.value)
                            }
                            className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-neutral-200">
                            Exclure morceaux recents
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={form.freshnessDays}
                            onChange={(event) =>
                              updateForm("freshnessDays", event.target.value)
                            }
                            className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <ChipInput
                          label="Blacklist artistes"
                          helper="Ex: bruit blanc, comptines, sons de sommeil."
                          placeholder="Ex: White Noise For Baby"
                          values={form.blacklistArtists}
                          onAdd={(value) =>
                            addUniqueValue("blacklistArtists", value)
                          }
                          onRemove={(value) =>
                            removeValue("blacklistArtists", value)
                          }
                        />
                        <ChipInput
                          label="Blacklist tags"
                          helper="Ex: acoustic, sleep, spoken-word."
                          placeholder="Ex: acoustic"
                          values={form.blacklistTags}
                          onAdd={(value) =>
                            addUniqueValue("blacklistTags", value)
                          }
                          onRemove={(value) =>
                            removeValue("blacklistTags", value)
                          }
                        />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-neutral-800 bg-[#0f0f0f]/70 p-4 md:p-5">
                      <h4 className="mb-4 text-lg font-black text-white">
                        3. Recettes metier (presets avances)
                      </h4>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {PRESETS.map((preset) => {
                          const active = form.presets.includes(preset.key);
                          return (
                            <button
                              key={preset.key}
                              type="button"
                              onClick={() => togglePreset(preset.key)}
                              className={`rounded-xl border p-4 text-left transition-colors ${
                                active
                                  ? "border-[#ff530b] bg-[#ff530b]/10"
                                  : "border-neutral-700 bg-[#171717] hover:border-neutral-500"
                              }`}
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <span className="font-bold text-white">
                                  {preset.title}
                                </span>
                                {active ? (
                                  <IconCheck
                                    size={16}
                                    className="text-[#ff7f4a]"
                                  />
                                ) : null}
                              </div>
                              <p className="text-xs text-neutral-400">
                                {preset.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {(editorMode === "advanced" || form.presets.length > 0) && (
                      <section className="rounded-2xl border border-neutral-800 bg-[#0f0f0f]/70 p-4 md:p-5">
                        <h4 className="mb-4 text-lg font-black text-white">
                          4. Tri et limites
                        </h4>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-neutral-200">
                              Taille playlist
                            </label>
                            <select
                              value={form.playlistSize}
                              onChange={(event) =>
                                updateForm("playlistSize", event.target.value)
                              }
                              className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                            >
                              <option value="20">20</option>
                              <option value="50">50</option>
                              <option value="100">100</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-neutral-200">
                              Methode de tri
                            </label>
                            <select
                              value={form.sortMethod}
                              onChange={(event) =>
                                updateForm("sortMethod", event.target.value)
                              }
                              className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                            >
                              {SORT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </section>
                    )}

                    <section className="rounded-2xl border border-neutral-800 bg-[#0f0f0f]/70 p-4 md:p-5">
                      <h4 className="mb-4 text-lg font-black text-white">
                        5. Declencheurs et planification
                      </h4>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-neutral-200">
                            Frequence
                          </label>
                          <select
                            value={form.frequency}
                            onChange={(event) =>
                              updateForm("frequency", event.target.value)
                            }
                            className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                          >
                            <option value="daily">Quotidienne</option>
                            <option value="weekly">Hebdomadaire</option>
                            <option value="monthly">Mensuelle</option>
                          </select>
                        </div>

                        {form.frequency === "weekly" ? (
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-neutral-200">
                              Jour
                            </label>
                            <select
                              value={form.weeklyDay}
                              onChange={(event) =>
                                updateForm("weeklyDay", event.target.value)
                              }
                              className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                            >
                              {WEEKLY_DAYS.map((day) => (
                                <option key={day} value={day}>
                                  {day}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        {form.frequency === "monthly" ? (
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-neutral-200">
                              Jour du mois
                            </label>
                            <select
                              value={form.monthlyDay}
                              onChange={(event) =>
                                updateForm("monthlyDay", event.target.value)
                              }
                              className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                            >
                              {MONTHLY_DAYS.map((day) => (
                                <option key={day} value={day}>
                                  {day}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-neutral-200">
                            Heure d'execution
                          </label>
                          <input
                            type="time"
                            value={form.runHour}
                            onChange={(event) =>
                              updateForm("runHour", event.target.value)
                            }
                            className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-semibold text-neutral-200">
                          Action cible
                        </label>
                        <select
                          value={form.targetAction}
                          onChange={(event) =>
                            updateForm("targetAction", event.target.value)
                          }
                          className="w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] px-4 py-3 text-white outline-none transition-colors focus:border-[#17AEFF]"
                        >
                          <option value="dashboard_cache">
                            Sauvegarder dans le cache du dashboard
                          </option>
                          <option value="spotify_export">
                            Export Spotify (API a brancher)
                          </option>
                          <option value="apple_export">
                            Export Apple Music (API a brancher)
                          </option>
                        </select>
                      </div>
                    </section>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="button"
                        onClick={createAutomation}
                        className="rounded-xl bg-[#ff530b] px-6 py-3 font-black text-white transition-colors hover:bg-[#ff6f2d]"
                      >
                        Creer l'automatisation
                      </button>
                      <button
                        type="button"
                        onClick={resetBuilder}
                        className="rounded-xl bg-neutral-800 px-6 py-3 font-bold text-white transition-colors hover:bg-neutral-700"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>

                <aside className="overflow-y-auto rounded-3xl border border-neutral-800 bg-[#111111] p-5">
                  <h4 className="text-xl font-black text-white">
                    Apercu logique
                  </h4>
                  <p className="mt-1 text-sm text-neutral-400">
                    Resume lisible pour valider rapidement la regle avant save.
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-neutral-300">
                    {summary.map((line) => (
                      <li
                        key={line}
                        className="rounded-lg border border-neutral-800 bg-[#161616] p-3"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </aside>
              </motion.div>
            ) : !selectedAuto ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
                className="min-h-[calc(100vh-240px)] rounded-3xl border border-neutral-800 bg-[#171717] p-5 md:p-7"
              >
                <div className="h-full overflow-visible py-3">
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <h3 className="text-lg font-bold text-white">
                      Mes automatisations
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsCreating(true)}
                      className="rounded-lg border border-[#17AEFF]/60 bg-[#17AEFF]/10 px-4 py-2 text-sm font-bold text-[#9be0ff] transition-colors hover:bg-[#17AEFF]/20"
                    >
                      + Creer
                    </button>
                  </div>

                  <div className="flex h-full items-center gap-6 overflow-x-auto overflow-y-visible pb-8 pt-2">
                    <div className="w-2 shrink-0 md:w-4" aria-hidden="true" />
                    {automations.map((auto) => (
                      <div
                        key={auto.id}
                        onClick={() => {
                          setSelectedAuto(auto);
                          setShowGeneratedPlaylists(false);
                        }}
                        className="group relative shrink-0 cursor-pointer py-2"
                      >
                        <TiltedCard
                          imageSrc={auto.image}
                          altText={auto.title}
                          captionText={auto.title}
                          countdownText="Prochaine generation planifiee"
                          containerHeight="420px"
                          containerWidth="300px"
                          imageHeight="420px"
                          imageWidth="300px"
                          rotateAmplitude={6}
                          scaleOnHover={1.04}
                          showMobileWarning={false}
                          showTooltip={false}
                          displayOverlayContent
                        />
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => setIsCreating(true)}
                      className="group flex h-[420px] w-[300px] shrink-0 items-center justify-center rounded-[22px] border-2 border-dashed border-neutral-700/70 bg-transparent text-neutral-500 transition-colors hover:border-[#17AEFF]/80 hover:bg-[#17AEFF]/5 hover:text-white"
                      aria-label="Create a new automation"
                    >
                      <span className="text-7xl font-light leading-none transition-transform duration-200 group-hover:scale-110">
                        +
                      </span>
                    </button>
                    <div className="w-2 shrink-0 md:w-4" aria-hidden="true" />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
                className="flex h-full flex-col"
              >
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setSelectedAuto(null)}
                      className="rounded-full bg-neutral-800 p-2 text-white transition-colors hover:bg-[#ff530b]"
                    >
                      <IconArrowLeft size={24} />
                    </button>
                    <div>
                      <h3 className="text-2xl font-bold text-white">
                        {selectedAuto.title}
                      </h3>
                      <p className="text-sm text-neutral-400">
                        {selectedAuto.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setForm(selectedAuto.settings || DEFAULT_FORM);
                        setSelectedAuto(null);
                        setIsCreating(true);
                        setEditorMode("advanced");
                      }}
                      className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
                    >
                      Dupliquer / modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGeneratedPlaylists((prev) => !prev)}
                      className="rounded-lg bg-[#17AEFF] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#2fc1ff]"
                    >
                      {showGeneratedPlaylists
                        ? "Masquer playlists generees"
                        : "Voir playlists generees"}
                    </button>
                  </div>
                </div>

                <BorderGlow
                  edgeSensitivity={30}
                  glowColor="40 80 80"
                  backgroundColor="#000000"
                  borderRadius={24}
                  glowRadius={35}
                  glowIntensity={1}
                  coneSpread={25}
                  animated
                  colors={["#17AEFF", "#ff530b", "#0ea5e9"]}
                >
                  <div className="p-6 md:p-8">
                    <h4 className="mb-4 text-xl font-bold text-white">
                      Parametres de l'automatisation
                    </h4>
                    <p className="mb-5 text-sm text-neutral-400">
                      Les fonctions backend FastAPI pourront mapper ces champs
                      vers vos recettes metier (Forgotten Favorites, Obsessions,
                      etc.).
                    </p>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {selectedAuto.settings ? (
                        summary.map((line) => (
                          <div
                            key={line}
                            className="rounded-lg border border-neutral-800 bg-[#151515] p-3 text-sm text-neutral-300"
                          >
                            {line}
                          </div>
                        ))
                      ) : (
                        <p className="text-neutral-400">
                          Cette automatisation est legacy et n'a pas encore un
                          schema complet de settings.
                        </p>
                      )}
                    </div>
                  </div>
                </BorderGlow>

                <AnimatePresence>
                  {showGeneratedPlaylists && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.22 }}
                      className="mt-6"
                    >
                      <div className="rounded-2xl border border-neutral-800 bg-[#171717] p-4 md:p-5">
                        <h5 className="mb-4 font-bold text-white">
                          Playlists generees par cette automatisation
                        </h5>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {selectedAuto.generatedPlaylists.map((playlist) => (
                            <div
                              key={playlist.id}
                              className="flex items-center justify-between rounded-xl border border-neutral-800 bg-[#111] p-4"
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-white">
                                  {playlist.name}
                                </span>
                                <span className="text-sm text-neutral-500">
                                  {playlist.date}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="block text-lg font-black text-[#17AEFF]">
                                  {playlist.tracks}
                                </span>
                                <span className="text-xs uppercase tracking-wide text-neutral-500">
                                  tracks
                                </span>
                              </div>
                            </div>
                          ))}
                          {selectedAuto.generatedPlaylists.length === 0 && (
                            <p className="text-neutral-500">
                              No playlists generated yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
