import { useState } from "react";
import {
  IconCalendarRepeat,
  IconClock,
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import {
  CRON_PRESETS,
  isValidCron,
  describeCron,
  DEFAULT_CRON,
} from "@/lib/automation-rules";

const FIELDS = [
  { key: "minute", label: "Minute", placeholder: "0-59", min: 0, max: 59 },
  { key: "hour", label: "Hour", placeholder: "0-23", min: 0, max: 23 },
  { key: "day", label: "Day of Month", placeholder: "1-31", min: 1, max: 31 },
  { key: "month", label: "Month", placeholder: "1-12", min: 1, max: 12 },
  { key: "weekday", label: "Day of Week", placeholder: "0-7", min: 0, max: 7 },
];

const CHEATSHEET = [
  { char: "*", desc: "Any value" },
  { char: ",", desc: "Value list (e.g. 1,3,5)" },
  { char: "-", desc: "Range (e.g. 1-5)" },
  { char: "/", desc: "Step (e.g. */5)" },
];

function parseCron(expr) {
  if (!isValidCron(expr)) return { minute: "", hour: "", day: "*", month: "*", weekday: "*" };
  const [minute, hour, day, month, weekday] = expr.trim().split(/\s+/);
  return { minute, hour, day, month, weekday };
}

function buildCron(parts) {
  return `${parts.minute} ${parts.hour} ${parts.day} ${parts.month} ${parts.weekday}`;
}

export default function CronEditor({ value, onChange }) {
  const enabled = isValidCron(value);
  const parts = parseCron(value);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const description = enabled ? describeCron(value) : null;

  const toggleEnabled = () => {
    onChange(enabled ? "" : DEFAULT_CRON);
  };

  const updatePart = (key, newValue) => {
    const raw = newValue.replace(/[^0-9/*,-]/g, "");
    const updated = { ...parts, [key]: raw || "*" };
    const expr = buildCron(updated);
    if (isValidCron(expr)) {
      onChange(expr);
    }
  };

  const applyPreset = (cron) => {
    onChange(cron);
  };

  return (
    <div className="space-y-6">

      <div className="max-w-2xl mx-auto space-y-5">
        {/* Toggle */}
        <button
          type="button"
          onClick={toggleEnabled}
          className={`w-full flex items-center justify-between rounded-xl border p-5 transition-all ${
            enabled
              ? "border-[#ff530b] bg-[#ff530b]/10"
              : "border-neutral-700 bg-[#1c1c1c] hover:border-neutral-500"
          }`}
        >
          <div className="flex items-center gap-3">
            <IconCalendarRepeat
              size={22}
              className={enabled ? "text-[#ff530b]" : "text-neutral-400"}
            />
            <div className="text-left">
              <div className="text-sm font-semibold text-white">Auto-update</div>
            </div>
          </div>
          <div
            className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
              enabled ? "bg-[#ff530b]" : "bg-neutral-600"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </div>
        </button>

        {enabled && (
          <>
            {/* Description */}
            {description && (
              <div className="rounded-xl border border-[#ff530b]/20 bg-[#ff530b]/5 px-4 py-3 text-center">
                <span className="text-sm font-medium text-[#ff530b]">{description}</span>
              </div>
            )}

            {/* Cron fields */}
            <div className="rounded-xl border border-neutral-700 bg-[#1c1c1c] p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <IconClock size={14} className="text-neutral-500" />
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Cron Expression
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium block text-center">
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={parts[field.key]}
                      onChange={(e) => updatePart(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full rounded-lg border border-neutral-600 bg-[#121212] px-2 py-2.5 text-center text-sm text-white font-mono focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Presets */}
            <div className="rounded-xl border border-neutral-700 bg-[#1c1c1c] p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <IconCalendar size={14} className="text-neutral-500" />
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Presets
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.cron}
                    type="button"
                    onClick={() => applyPreset(preset.cron)}
                    className={`flex flex-col items-start rounded-lg border px-3.5 py-2.5 text-left transition-all ${
                      value === preset.cron
                        ? "border-[#ff530b]/40 bg-[#ff530b]/10 text-[#ff530b]"
                        : "border-neutral-700/50 bg-neutral-800/30 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800/60"
                    }`}
                  >
                    <span className="text-xs font-semibold">{preset.label}</span>
                    <span className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      {preset.cron}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cheatsheet */}
            <div className="rounded-xl border border-neutral-700 bg-[#1c1c1c] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCheatsheet(!showCheatsheet)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm text-neutral-400 hover:text-neutral-300 transition-colors"
              >
                <span className="font-medium">Cron Cheatsheet</span>
                {showCheatsheet ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </button>
              {showCheatsheet && (
                <div className="border-t border-neutral-700/50 px-5 py-4 space-y-2.5">
                  {CHEATSHEET.map((item) => (
                    <div key={item.char} className="flex items-center gap-3">
                      <code className="text-xs font-mono text-[#ff530b] bg-[#ff530b]/10 px-2 py-0.5 rounded min-w-[2rem] text-center">
                        {item.char}
                      </code>
                      <span className="text-xs text-neutral-400">{item.desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
