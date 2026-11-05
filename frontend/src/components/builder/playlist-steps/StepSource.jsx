import { SORT_OPTIONS, WINDOW_OPTIONS, windowOption } from "@/lib/automation-rules";
import CustomSelect from "@/components/ui/CustomSelect";

export function StepSource({ data, onChange }) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">
          Which of your listens?
        </h3>
        <p className="text-neutral-400 text-sm">
          Pick the time window to read, and how to rank the tracks in it.
        </p>
      </div>

      <div className="max-w-lg mx-auto space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SORT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = data.sort === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...data, sort: opt.value })}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? "border-[var(--ember)] bg-[var(--ember)]/10"
                    : "border-neutral-700 bg-[#1c1c1c] hover:border-neutral-500"
                }`}
              >
                <div
                  className={`mt-0.5 rounded-lg p-2 ${
                    isSelected ? "bg-[var(--ember)]/20 text-[var(--ember)]" : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {opt.label}
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
          <p className="mb-1.5 text-sm font-medium text-neutral-300">Time window</p>
          <CustomSelect
            label="Time window"
            placeholder="Choose a window"
            value={windowOption(data.window)?.value ?? ""}
            onChange={(value) => onChange({ ...data, window: WINDOW_OPTIONS.find((o) => o.value === value).window })}
            options={WINDOW_OPTIONS}
          />
        </div>
      </div>
    </div>
  );
}
