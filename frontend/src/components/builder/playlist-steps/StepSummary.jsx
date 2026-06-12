import {
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
  isValidCron,
  describeCron,
} from "@/lib/automation-rules";
import { countActiveConditions } from "@/lib/filter-engine";

export function StepSummary({ data }) {
  const sourceLabel =
    SOURCE_TYPE_LABELS[data.source.type] || data.source.type;
  const periodLabel =
    PERIOD_OPTIONS.find((p) => p.value === data.source.period)?.label ||
    data.source.period;
  const filterCount = countActiveConditions(data.filterGroups);
  const isCronValid = isValidCron(data.cron);
  const filterLabel = filterCount > 0 ? `${filterCount} condition${filterCount > 1 ? "s" : ""}` : "None";

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

          <div className="grid grid-cols-3 divide-x divide-neutral-700">
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
                Schedule
              </div>
              <div className="text-sm font-semibold text-white">
                {isCronValid ? describeCron(data.cron) : "Static"}
              </div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {isCronValid ? "Auto-updated" : "No auto-update"}
              </div>
            </div>
            <div className="p-5">
              <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">
                Filters
              </div>
              <div className="text-sm font-semibold text-white">
                {filterLabel}
              </div>
              <div className="text-xs text-neutral-400 mt-0.5">
                {filterCount > 0 ? "Active filters" : "All tracks pass"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
