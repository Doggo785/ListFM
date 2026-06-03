import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconMusic,
  IconHeart,
  IconClock,
  IconUsers,
  IconCalendarRepeat,
  IconBolt,
  IconSparkles,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
  RECURRENCE_UNITS,
  RECURRENCE_UNIT_LABELS,
  createDefaultAutomation,
} from "@/lib/automation-rules";

const STEPS = [
  { id: 1, label: "Identity", icon: IconSparkles },
  { id: 2, label: "Source", icon: IconMusic },
  { id: 3, label: "Recurrence", icon: IconCalendarRepeat },
  { id: 4, label: "Summary", icon: IconCheck },
];

const SOURCE_OPTIONS = [
  {
    type: SOURCE_TYPES.TOP_TRACKS,
    icon: IconBolt,
    description: "Your most played tracks over the selected period",
  },
  {
    type: SOURCE_TYPES.RECENT_TRACKS,
    icon: IconClock,
    description: "Your most recent listens",
  },
  {
    type: SOURCE_TYPES.LOVED_TRACKS,
    icon: IconHeart,
    description: "Your Last.fm loved tracks",
  },
  {
    type: SOURCE_TYPES.TOP_ARTISTS,
    icon: IconUsers,
    description: "Tracks from your favorite artists",
  },
];

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isDone = step.id < currentStep;
        return (
          <div key={step.id} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={`w-8 h-px transition-colors ${
                  isDone ? "bg-[#ff530b]" : "bg-neutral-700"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-[#ff530b] text-white"
                  : isDone
                    ? "bg-[#ff530b]/20 text-[#ff530b]"
                    : "bg-neutral-800 text-neutral-500"
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepIdentity({ data, onChange }) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">
          Give your automation a name
        </h3>
        <p className="text-neutral-400 text-sm">
          Choose a clear name so you can easily find this playlist.
        </p>
      </div>

      <div className="space-y-4 max-w-lg mx-auto">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Playlist name
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="e.g. Monthly Discoveries"
            className="w-full rounded-lg border border-neutral-700 bg-[#1c1c1c] px-4 py-3 text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-colors"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Description{" "}
            <span className="text-neutral-500 font-normal">(optional)</span>
          </label>
          <textarea
            value={data.description}
            onChange={(e) =>
              onChange({ ...data, description: e.target.value })
            }
            placeholder="e.g. Compiles my new musical discoveries every month"
            rows={3}
            className="w-full rounded-lg border border-neutral-700 bg-[#1c1c1c] px-4 py-3 text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-colors resize-none"
          />
        </div>
      </div>
    </div>
  );
}

function StepSource({ data, onChange }) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">
          Where do the tracks come from?
        </h3>
        <p className="text-neutral-400 text-sm">
          Choose the source and time period for your listening data.
        </p>
      </div>

      <div className="max-w-lg mx-auto space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SOURCE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = data.source.type === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() =>
                  onChange({
                    ...data,
                    source: { ...data.source, type: opt.type },
                  })
                }
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? "border-[#ff530b] bg-[#ff530b]/10"
                    : "border-neutral-700 bg-[#1c1c1c] hover:border-neutral-500"
                }`}
              >
                <div
                  className={`mt-0.5 rounded-lg p-2 ${
                    isSelected ? "bg-[#ff530b]/20 text-[#ff530b]" : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {SOURCE_TYPE_LABELS[opt.type]}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    {opt.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Time period
          </label>
          <select
            value={data.source.period}
            onChange={(e) =>
              onChange({
                ...data,
                source: { ...data.source, period: e.target.value },
              })
            }
            className="w-full rounded-lg border border-neutral-700 bg-[#1c1c1c] px-4 py-3 text-white focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-colors appearance-none"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function StepRecurrence({ data, onChange }) {
  const toggleRecurrence = () => {
    onChange({
      ...data,
      recurrence: { ...data.recurrence, enabled: !data.recurrence.enabled },
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">
          How often should it update?
        </h3>
        <p className="text-neutral-400 text-sm">
          Schedule automatic updates for your playlist.
        </p>
      </div>

      <div className="max-w-lg mx-auto space-y-6">
        <button
          type="button"
          onClick={toggleRecurrence}
          className={`w-full flex items-center justify-between rounded-xl border p-5 transition-all ${
            data.recurrence.enabled
              ? "border-[#ff530b] bg-[#ff530b]/10"
              : "border-neutral-700 bg-[#1c1c1c] hover:border-neutral-500"
          }`}
        >
          <div className="flex items-center gap-3">
            <IconCalendarRepeat
              size={22}
              className={data.recurrence.enabled ? "text-[#ff530b]" : "text-neutral-400"}
            />
            <div className="text-left">
              <div className="text-sm font-semibold text-white">
                Auto-update
              </div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {data.recurrence.enabled
                  ? "Enabled — playlist regenerates automatically"
                  : "Disabled — static playlist"}
              </div>
            </div>
          </div>
          <div
            className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
              data.recurrence.enabled ? "bg-[#ff530b]" : "bg-neutral-600"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                data.recurrence.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </div>
        </button>

        {data.recurrence.enabled && (
          <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-[#1c1c1c] p-5">
            <div className="flex items-center gap-2">
              <label className="text-sm text-neutral-400">Every</label>
              <input
                type="number"
                min={1}
                max={365}
                value={data.recurrence.interval}
                onChange={(e) =>
                  onChange({
                    ...data,
                    recurrence: {
                      ...data.recurrence,
                      interval: parseInt(e.target.value) || 1,
                    },
                  })
                }
                className="w-16 rounded-lg border border-neutral-600 bg-[#121212] px-3 py-2 text-center text-white focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-colors"
              />
            </div>
            <select
              value={data.recurrence.unit}
              onChange={(e) =>
                onChange({
                  ...data,
                  recurrence: {
                    ...data.recurrence,
                    unit: e.target.value,
                  },
                })
              }
              className="flex-1 rounded-lg border border-neutral-600 bg-[#121212] px-3 py-2 text-white focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-colors appearance-none"
            >
              {Object.entries(RECURRENCE_UNIT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function StepSummary({ data }) {
  const sourceLabel =
    SOURCE_TYPE_LABELS[data.source.type] || data.source.type;
  const periodLabel =
    PERIOD_OPTIONS.find((p) => p.value === data.source.period)?.label ||
    data.source.period;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">
          All set!
        </h3>
        <p className="text-neutral-400 text-sm">
          Review your configuration before creating the automation.
        </p>
      </div>

      <div className="max-w-lg mx-auto">
        <div className="rounded-xl border border-neutral-700 bg-[#1c1c1c] overflow-hidden">
          <div className="p-6 border-b border-neutral-700">
            <div className="text-xs font-medium text-[#ff530b] uppercase tracking-wider mb-1">
              Playlist
            </div>
            <div className="text-xl font-bold text-white">
              {data.name || <span className="text-neutral-500 italic">Untitled</span>}
            </div>
            {data.description && (
              <div className="text-sm text-neutral-400 mt-1">
                {data.description}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 divide-x divide-neutral-700">
            <div className="p-5">
              <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                Source
              </div>
              <div className="text-sm font-semibold text-white">
                {sourceLabel}
              </div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {periodLabel}
              </div>
            </div>
            <div className="p-5">
              <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                Recurrence
              </div>
              <div className="text-sm font-semibold text-white">
                {data.recurrence.enabled
                  ? `Every ${data.recurrence.interval} ${RECURRENCE_UNIT_LABELS[data.recurrence.unit]}`
                  : "Static"}
              </div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {data.recurrence.enabled
                  ? "Auto-updated"
                  : "No auto-update"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlaylistNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState(createDefaultAutomation());

  const canGoNext = () => {
    if (step === 1) return data.name.trim().length > 0;
    return true;
  };

  const handleCreate = () => {
    const existing = JSON.parse(localStorage.getItem("listfm_automations") || "[]");
    const updated = [...existing, data];
    localStorage.setItem("listfm_automations", JSON.stringify(updated));
    navigate("/playlists");
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <StepIdentity data={data} onChange={setData} />;
      case 2:
        return <StepSource data={data} onChange={setData} />;
      case 3:
        return <StepRecurrence data={data} onChange={setData} />;
      case 4:
        return <StepSummary data={data} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-full min-w-0 flex-1 overflow-y-auto bg-[#121212] p-5 md:p-10">
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        {/* Header */}
        <header className="mb-6 shrink-0">
          <button
            type="button"
            onClick={() => navigate("/playlists")}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm mb-4"
          >
            <IconArrowLeft size={16} />
            Back to playlists
          </button>
          <h2 className="text-3xl md:text-4xl font-black text-white">
            <span className="text-[#17AEFF]">New</span> automation
          </h2>
          <p className="mt-1 text-neutral-400 text-sm">
            Create an auto-generated playlist from your Last.fm listening history.
          </p>
        </header>

        {/* Step indicator */}
        <StepIndicator currentStep={step} />

        {/* Step content */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1">{renderStep()}</div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-6 pb-4 border-t border-neutral-800 mt-6 shrink-0">
            <Button
              variant="outline"
              size="lg"
              onClick={() => (step > 1 ? setStep(step - 1) : navigate("/playlists"))}
              className="border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              <IconArrowLeft size={16} className="mr-2" />
              {step > 1 ? "Back" : "Cancel"}
            </Button>

            {step < 4 ? (
              <Button
                size="lg"
                disabled={!canGoNext()}
                onClick={() => setStep(step + 1)}
                className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <IconArrowRight size={16} className="ml-2" />
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleCreate}
                className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90"
              >
                <IconCheck size={16} className="mr-2" />
                Create automation
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
