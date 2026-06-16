import { useState, useRef, useEffect } from "react";
import {
  IconPlus,
  IconTrash,
  IconSwitch2,
  IconBolt,
  IconHeart,
  IconChartBar,
  IconUsers,
  IconList,
  IconTag,
  IconClock,
  IconFilter,
  IconGitBranch,
  IconListCheck,
  IconSearch,
  IconHelp,
} from "@tabler/icons-react";
import {
  FILTER_FIELDS,
  FILTER_OPERATORS,
  createGroup,
  createCondition,
} from "@/lib/automation-rules";
import CustomSelect from "@/components/ui/CustomSelect";

const INPUT_CLASSES =
  "rounded-lg border border-neutral-700/80 bg-[#1c1c1c] px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b]/30 transition-all tabular-nums";

const FIELD_ICONS = {
  userplaycount: IconBolt,
  userloved: IconHeart,
  playcount: IconChartBar,
  global_playcount: IconChartBar,
  listeners: IconUsers,
  rank: IconList,
  tags: IconTag,
  timestamp: IconClock,
};

const FIELD_ENTRIES = Object.entries(FILTER_FIELDS);

function LogicToggle({ value, onChange }) {
  return (
    <div className="flex items-center rounded-xl border border-neutral-700/60 bg-[#111] p-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onChange("AND")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
          value === "AND"
            ? "bg-[#ff530b]/20 text-[#ff530b] shadow-[0_0_12px_rgba(255,83,11,0.15)]"
            : "text-neutral-500 hover:text-neutral-300"
        }`}
      >
        <IconListCheck size={12} />
        All
      </button>
      <button
        type="button"
        onClick={() => onChange("OR")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
          value === "OR"
            ? "bg-purple-500/20 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.15)]"
            : "text-neutral-500 hover:text-neutral-300"
        }`}
      >
        <IconSwitch2 size={12} />
        Any
      </button>
    </div>
  );
}

function FilterRow({ condition, onChange, onRemove, availableTags = [], disabledFields = [] }) {
  const fieldDef = FILTER_FIELDS[condition.field] || { type: "number", description: "" };
  const operators = FILTER_OPERATORS[fieldDef.type] || FILTER_OPERATORS.number;
  const FieldIcon = FIELD_ICONS[condition.field] || IconBolt;
  const isBoolean = fieldDef.type === "boolean";
  const isText = fieldDef.type === "text";
  const isDate = fieldDef.type === "date";
  const needsMax = condition.operator === "between";

  const [tagSearch, setTagSearch] = useState(condition.field === "tags" ? (condition.value || "") : "");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagSource, setTagSource] = useState(condition.tagSource || "artist");
  const tagInputRef = useRef(null);

  const currentTags = availableTags[tagSource] || [];
  const searchLower = tagSearch.toLowerCase();
  const filteredTags = currentTags.filter(
    (t) => t.name.includes(searchLower) && t.name !== condition.value
  ).slice(0, 12);

  useEffect(() => {
    const handler = (e) => {
      if (tagInputRef.current && !tagInputRef.current.contains(e.target)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fieldOptions = FIELD_ENTRIES
    .filter(([key]) => !disabledFields.includes(key))
    .map(([key, def]) => ({
      value: key,
      label: def.label,
      icon: FIELD_ICONS[key] || IconBolt,
    }));

  const operatorOptions = operators.map((op) => ({
    value: op.value,
    label: op.label,
  }));

  const renderValueInput = () => {
    if (isBoolean) {
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...condition, value: true })}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all border ${
              condition.value === true
                ? "bg-[#ff530b]/15 text-[#ff530b] border-[#ff530b]/30"
                : "bg-neutral-800/50 text-neutral-500 border-neutral-700/50 hover:border-neutral-600"
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...condition, value: false })}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all border ${
              condition.value === false
                ? "bg-[#ff530b]/15 text-[#ff530b] border-[#ff530b]/30"
                : "bg-neutral-800/50 text-neutral-500 border-neutral-700/50 hover:border-neutral-600"
            }`}
          >
            No
          </button>
        </div>
      );
    }

    if (condition.field === "tags") {
      const tagSourceLabel = tagSource === "artist" ? "Artist" : "Album";
      return (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            {[
              { value: "artist", label: "Artist", Icon: IconBolt, active: "bg-[#ff530b]/15 text-[#ff530b] border border-[#ff530b]/30" },
              { value: "album", label: "Album", Icon: IconTag, active: "bg-purple-500/15 text-purple-400 border border-purple-500/30" },
            ].map(({ value, label, Icon, active }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setTagSource(value); onChange({ ...condition, tagSource: value }); }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  tagSource === value ? active : "text-neutral-500 border border-transparent hover:text-neutral-300"
                }`}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
          </div>
          <div className="relative" ref={tagInputRef}>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-700/80 bg-[#1c1c1c] px-3.5 py-2.5">
              <IconSearch size={14} className="text-neutral-500 shrink-0" />
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => {
                  setTagSearch(e.target.value);
                  setShowTagDropdown(true);
                  if (e.target.value) {
                    onChange({ ...condition, value: e.target.value });
                  }
                }}
                onFocus={() => setShowTagDropdown(true)}
                placeholder={`Search ${tagSourceLabel.toLowerCase()} tags...`}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none min-w-0"
              />
            </div>
            {showTagDropdown && (
              <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] shadow-[0_12px_40px_rgba(0,0,0,0.6)] overflow-hidden">
                <div className="max-h-56 overflow-y-auto p-1">
                  {currentTags.length === 0 ? (
                    <div className="px-3 py-2.5 text-sm text-neutral-500">
                      {tagSearch
                        ? `Use "${tagSearch}"`
                        : "Load a preview to see available tags"}
                    </div>
                  ) : filteredTags.length === 0 ? (
                    <div className="px-3 py-2.5 text-sm text-neutral-500">
                      {tagSearch ? `Use "${tagSearch}"` : "No matching tags"}
                    </div>
                  ) : (
                    filteredTags.map((tag) => (
                      <button
                        key={tag.name}
                        type="button"
                        onClick={() => {
                          onChange({ ...condition, value: tag.name, tagSource });
                          setTagSearch(tag.name);
                          setShowTagDropdown(false);
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors text-left ${
                          condition.value === tag.name
                            ? "bg-[#ff530b]/15 text-[#ff530b]"
                            : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                        }`}
                      >
                        <IconTag size={12} className="shrink-0 text-neutral-500" />
                        <span className="flex-1 truncate">{tag.name}</span>
                        <span className={`text-[10px] font-mono tabular-nums shrink-0 ${
                          tag.count >= 70 ? "text-[#ff530b]" : tag.count >= 40 ? "text-neutral-400" : "text-neutral-600"
                        }`}>
                          {tag.count}%
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-600 text-xs">Min reliability:</span>
            <span className="group/tooltip relative flex items-center">
              <IconHelp size={12} className="text-neutral-600 hover:text-neutral-400 transition-colors cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg border border-neutral-700 bg-[#1a1a1a] px-3 py-2 text-[11px] text-neutral-300 leading-relaxed shadow-[0_8px_24px_rgba(0,0,0,0.5)] opacity-0 pointer-events-none group-hover/tooltip:opacity-100 group-hover/tooltip:pointer-events-auto transition-opacity z-50">
                Minimum percentage of tracks by this {tagSource === "artist" ? "artist" : "album"} that carry this tag. For example, 80% means 8 out of 10 tracks are associated with this genre.
                <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#1a1a1a]" />
              </span>
            </span>
            <input
              type="number"
              value={condition.countMin ?? 0}
              onChange={(e) => onChange({ ...condition, countMin: Number(e.target.value) })}
              min="0"
              max="100"
              placeholder="0"
              className="w-16 rounded-lg border border-neutral-700/80 bg-[#1c1c1c] px-2.5 py-2 text-sm text-white focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b]/30 transition-all tabular-nums"
            />
            <span className="text-neutral-600 text-xs">%</span>
          </div>
        </div>
      );
    }

    if (isDate) {
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="number"
              value={condition.value ?? ""}
              onChange={(e) => onChange({ ...condition, value: e.target.value === "" ? "" : Number(e.target.value) })}
              placeholder="e.g. 30"
              min="0"
              className={`w-full ${INPUT_CLASSES}`}
            />
          </div>
          <span className="text-neutral-500 text-sm font-medium shrink-0">days ago</span>
        </div>
      );
    }

    if (condition.field === "rank") {
      return (
        <div className="flex items-center gap-2">
          <span className="text-neutral-500 text-sm font-medium shrink-0">#</span>
          <input
            type="number"
            value={condition.value ?? ""}
            onChange={(e) => onChange({ ...condition, value: e.target.value === "" ? "" : Number(e.target.value) })}
            placeholder="e.g. 10"
            min="1"
            className={`flex-1 ${INPUT_CLASSES}`}
          />
          {needsMax && (
            <>
              <span className="text-neutral-600 text-xs font-medium">to</span>
              <span className="text-neutral-500 text-sm font-medium">#</span>
              <input
                type="number"
                value={condition.valueMax ?? ""}
                onChange={(e) => onChange({ ...condition, valueMax: e.target.value === "" ? "" : Number(e.target.value) })}
                placeholder="e.g. 50"
                min="1"
                className={`flex-1 ${INPUT_CLASSES}`}
              />
            </>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <input
          type={isText ? "text" : "number"}
          value={condition.value ?? ""}
          onChange={(e) => onChange({ ...condition, value: isText ? e.target.value : (e.target.value === "" ? "" : Number(e.target.value)) })}
          placeholder={isText ? "Enter value..." : "Min"}
          className={`flex-1 ${INPUT_CLASSES}`}
        />
        {needsMax && (
          <>
            <span className="text-neutral-600 text-xs font-medium">to</span>
            <input
              type="number"
              value={condition.valueMax ?? ""}
              onChange={(e) => onChange({ ...condition, valueMax: e.target.value === "" ? "" : Number(e.target.value) })}
              placeholder="Max"
              className={`flex-1 ${INPUT_CLASSES}`}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="group/row rounded-xl border border-neutral-800/80 bg-[#141414] hover:border-neutral-600/80 transition-all">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="rounded-lg bg-neutral-800/60 p-2 shrink-0">
          <FieldIcon size={14} className="text-neutral-400 group-hover/row:text-[#ff530b] transition-colors" />
        </div>

        <CustomSelect
          value={condition.field}
          onChange={(newField) => {
            const newType = FILTER_FIELDS[newField]?.type || "number";
            const defaultOp = FILTER_OPERATORS[newType]?.[0]?.value || "eq";
            onChange({ ...condition, field: newField, operator: defaultOp });
          }}
          options={fieldOptions}
          className="flex-1 min-w-0"
        />

        <CustomSelect
          value={condition.operator}
          onChange={(op) => onChange({ ...condition, operator: op })}
          options={operatorOptions}
          className="w-32 shrink-0"
        />

        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg p-2 text-neutral-700 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover/row:opacity-100"
        >
          <IconTrash size={14} />
        </button>
      </div>

      <div className="px-4 pb-3.5 pt-0">
        <p className={`text-[11px] mb-2.5 leading-relaxed ${
          disabledFields.includes(condition.field) ? "text-amber-500/80" : "text-neutral-600"
        }`}>
          {disabledFields.includes(condition.field)
            ? "This filter is not available with the current source. Change the source to \"Recent Tracks\" to use it."
            : condition.field === "tags"
              ? `${tagSource === "artist" ? "Genre or mood tag associated with the artist" : "Genre or mood tag associated with the album"} of the track`
              : fieldDef.description}
        </p>
        {renderValueInput()}
      </div>
    </div>
  );
}

function FilterGroup({ group, onChange, onRemove, depth = 0, availableTags = [], disabledFields = [] }) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const menuRef = useRef(null);
  const subGroups = group.groups || [];

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowAddMenu(false);
    };
    if (showAddMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAddMenu]);

  const updateCondition = (idx, newCondition) => {
    const conditions = [...group.conditions];
    conditions[idx] = newCondition;
    onChange({ ...group, conditions });
  };

  const removeCondition = (idx) => {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });
  };

  const addCondition = () => {
    onChange({
      ...group,
      conditions: [...group.conditions, createCondition()],
    });
    setShowAddMenu(false);
  };

  const addSubGroup = () => {
    onChange({
      ...group,
      groups: [...subGroups, createGroup()],
    });
    setShowAddMenu(false);
  };

  const updateSubGroup = (idx, newGroup) => {
    const updated = [...subGroups];
    updated[idx] = newGroup;
    onChange({ ...group, groups: updated });
  };

  const removeSubGroup = (idx) => {
    onChange({ ...group, groups: subGroups.filter((_, i) => i !== idx) });
  };

  const logicLabel = group.logic === "AND" ? "all" : "any";
  const isNested = depth > 0;

  return (
    <div
      className={`rounded-2xl transition-all ${
        isNested
          ? "border border-purple-500/20 bg-[#131316] shadow-[inset_3px_0_0_rgba(168,85,247,0.4)]"
          : "border border-neutral-800/80 bg-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
      }`}
    >
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-neutral-800/50">
        <LogicToggle value={group.logic} onChange={(val) => onChange({ ...group, logic: val })} />

        <span className="text-xs text-neutral-500 flex-1">
          Match tracks where{" "}
          <span className={`font-semibold ${group.logic === "AND" ? "text-[#ff530b]/70" : "text-purple-400/70"}`}>
            {logicLabel}
          </span>{" "}
          of these conditions are met
        </span>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-2 text-neutral-700 hover:text-red-400 hover:bg-red-400/10 transition-all"
            title="Remove group"
          >
            <IconTrash size={14} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {group.conditions.length === 0 && subGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-2xl bg-neutral-800/30 p-3 mb-3">
              <IconFilter size={20} className="text-neutral-600" />
            </div>
            <p className="text-sm text-neutral-500 font-medium">No conditions yet</p>
            <p className="text-xs text-neutral-600 mt-1">
              Click the button below to add your first filter
            </p>
          </div>
        )}

        {group.conditions.map((cond, i) => (
          <FilterRow
            key={cond.id}
            condition={cond}
            onChange={(c) => updateCondition(i, c)}
            onRemove={() => removeCondition(i)}
            availableTags={availableTags}
            disabledFields={disabledFields}
          />
        ))}

        {subGroups.map((sub, i) => (
          <FilterGroup
            key={sub.id}
            group={sub}
            onChange={(g) => updateSubGroup(i, g)}
            onRemove={() => removeSubGroup(i)}
            depth={depth + 1}
            availableTags={availableTags}
            disabledFields={disabledFields}
          />
        ))}
      </div>

      <div className="px-4 pb-4 relative" ref={menuRef}>
        {showAddMenu ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addCondition}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-[#ff530b]/30 bg-[#ff530b]/10 px-4 py-3 text-sm font-medium text-[#ff530b] hover:bg-[#ff530b]/15 transition-all"
            >
              <IconPlus size={14} />
              Add condition
            </button>
            <button
              type="button"
              onClick={addSubGroup}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm font-medium text-purple-400 hover:bg-purple-500/15 transition-all"
            >
              <IconGitBranch size={14} />
              Add sub-group
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddMenu(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700/60 bg-transparent px-4 py-3 text-sm text-neutral-500 hover:border-[#ff530b]/40 hover:text-[#ff530b] hover:bg-[#ff530b]/5 transition-all w-full"
          >
            <IconPlus size={14} />
            Add
          </button>
        )}
      </div>
    </div>
  );
}

export default function FilterBuilder({ value, onChange, availableTags = [], disabledFields = [] }) {
  const groups = value || [];

  const updateGroup = (idx, newGroup) => {
    const updated = [...groups];
    updated[idx] = newGroup;
    onChange(updated);
  };

  const removeGroup = (idx) => {
    onChange(groups.filter((_, i) => i !== idx));
  };

  const addGroup = () => {
    onChange([...groups, createGroup()]);
  };

  return (
    <div className="space-y-4">
      {groups.map((group, i) => (
        <div key={group.id}>
          {i > 0 && (
            <div className="flex items-center gap-3 justify-center py-2 mb-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-700 to-transparent" />
              <span className="text-[10px] text-neutral-600 uppercase tracking-[0.2em] font-bold px-2">OR</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-700 to-transparent" />
            </div>
          )}
          <FilterGroup
            group={group}
            onChange={(g) => updateGroup(i, g)}
            onRemove={groups.length > 1 ? () => removeGroup(i) : undefined}
            availableTags={availableTags}
            disabledFields={disabledFields}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addGroup}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700/60 bg-transparent px-4 py-3 text-sm text-neutral-500 hover:border-purple-500/40 hover:text-purple-400 hover:bg-purple-500/5 transition-all w-full"
      >
        <IconPlus size={14} />
        Add filter group
      </button>
    </div>
  );
}
