import {
  IconHeart,
  IconClock,
  IconUsers,
  IconBolt,
} from "@tabler/icons-react";
import {
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
} from "@/lib/automation-rules";

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

export function StepSource({ data, onChange }) {
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
