import { IconFilter } from "@tabler/icons-react";
import FilterBuilder from "@/components/builder/FilterBuilder";
import { countActiveConditions } from "@/lib/filter-engine";

export function StepFilters({ data, onChange }) {
  const filterCount = countActiveConditions(data.filterGroups);

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">
          Filter your tracks
        </h3>
        <p className="text-neutral-400 text-sm max-w-md mx-auto">
          Add conditions to refine which tracks appear in your playlist.
          You can skip this step for no filters.
        </p>
        {filterCount > 0 && (
          <div className="inline-flex items-center gap-2 mt-3 rounded-full bg-[#ff530b]/10 border border-[#ff530b]/20 px-4 py-1.5">
            <IconFilter size={13} className="text-[#ff530b]" />
            <span className="text-xs font-medium text-[#ff530b]">
              {filterCount} active condition{filterCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto">
        <FilterBuilder
          value={data.filterGroups}
          onChange={(filterGroups) => onChange({ ...data, filterGroups })}
          disabledFields={data.source?.type !== "recent_tracks" ? ["timestamp"] : []}
        />
      </div>
    </div>
  );
}
