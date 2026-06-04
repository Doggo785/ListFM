import { useState } from "react";
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
  IconSparkles,
  IconClock,
} from "@tabler/icons-react";
import {
  FILTER_FIELDS,
  FILTER_OPERATORS,
  createGroup,
  createCondition,
} from "@/lib/automation-rules";

const FIELD_ICONS = {
  userplaycount: IconBolt,
  userloved: IconHeart,
  playcount: IconChartBar,
  global_playcount: IconChartBar,
  listeners: IconUsers,
  rank: IconList,
  tags: IconTag,
  match: IconSparkles,
  timestamp: IconClock,
};

const FIELD_ENTRIES = Object.entries(FILTER_FIELDS);

function LogicToggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(value === "AND" ? "OR" : "AND")}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
        value === "AND"
          ? "bg-[#ff530b]/15 text-[#ff530b] border border-[#ff530b]/30"
          : "bg-purple-500/15 text-purple-400 border border-purple-500/30"
      }`}
    >
      <IconSwitch2 size={12} />
      {value}
    </button>
  );
}

function FilterRow({ condition, onChange, onRemove }) {
  const fieldDef = FILTER_FIELDS[condition.field] || { type: "number" };
  const operators = FILTER_OPERATORS[fieldDef.type] || FILTER_OPERATORS.number;
  const FieldIcon = FIELD_ICONS[condition.field] || IconBolt;
  const isBoolean = fieldDef.type === "boolean";
  const isText = fieldDef.type === "text";
  const needsMax = condition.operator === "between";

  return (
    <div className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-[#141414] px-3 py-2.5 group/row hover:border-neutral-600 transition-colors">
      <div className="rounded-md bg-neutral-800/60 p-1.5 shrink-0">
        <FieldIcon size={14} className="text-neutral-400" />
      </div>

      <select
        value={condition.field}
        onChange={(e) => {
          const newField = e.target.value;
          const newType = FILTER_FIELDS[newField]?.type || "number";
          const defaultOp = FILTER_OPERATORS[newType]?.[0]?.value || "eq";
          onChange({ ...condition, field: newField, operator: defaultOp });
        }}
        className="rounded-lg border border-neutral-700 bg-[#1a1a1a] px-2.5 py-1.5 text-sm text-white focus:border-[#ff530b] focus:outline-none appearance-none min-w-[120px]"
      >
        {FIELD_ENTRIES.map(([key, def]) => (
          <option key={key} value={key}>{def.label}</option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        className="rounded-lg border border-neutral-700 bg-[#1a1a1a] px-2.5 py-1.5 text-sm text-white focus:border-[#ff530b] focus:outline-none appearance-none w-24"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {isBoolean ? (
        <button
          type="button"
          onClick={() => onChange({ ...condition, value: condition.value === true ? false : true })}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
            condition.value
              ? "bg-[#ff530b]/15 text-[#ff530b] border border-[#ff530b]/30"
              : "bg-neutral-800 text-neutral-400 border border-neutral-700"
          }`}
        >
          {condition.value ? "Yes" : "No"}
        </button>
      ) : isText ? (
        <input
          type="text"
          value={condition.value || ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="value"
          className="flex-1 rounded-lg border border-neutral-700 bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none min-w-0"
        />
      ) : (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <input
            type="number"
            value={condition.value ?? ""}
            onChange={(e) => onChange({ ...condition, value: e.target.value === "" ? "" : Number(e.target.value) })}
            placeholder="min"
            className="w-20 rounded-lg border border-neutral-700 bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none tabular-nums"
          />
          {needsMax && (
            <>
              <span className="text-neutral-500 text-xs">and</span>
              <input
                type="number"
                value={condition.valueMax ?? ""}
                onChange={(e) => onChange({ ...condition, valueMax: e.target.value === "" ? "" : Number(e.target.value) })}
                placeholder="max"
                className="w-20 rounded-lg border border-neutral-700 bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none tabular-nums"
              />
            </>
          )}
        </div>
      )}

      {condition.field === "tags" && (
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-neutral-500 text-xs">count≥</span>
          <input
            type="number"
            value={condition.countMin ?? 0}
            onChange={(e) => onChange({ ...condition, countMin: Number(e.target.value) })}
            className="w-14 rounded-lg border border-neutral-700 bg-[#1a1a1a] px-2 py-1.5 text-sm text-white focus:border-[#ff530b] focus:outline-none tabular-nums"
          />
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-lg p-1.5 text-neutral-600 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover/row:opacity-100"
      >
        <IconTrash size={14} />
      </button>
    </div>
  );
}

function FilterGroup({ group, onChange, onRemove, depth = 0 }) {
  const [showAddMenu, setShowAddMenu] = useState(false);

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
      groups: [...(group.groups || []), createGroup()],
    });
    setShowAddMenu(false);
  };

  const updateSubGroup = (idx, newGroup) => {
    const groups = [...(group.groups || [])];
    groups[idx] = newGroup;
    onChange({ ...group, groups });
  };

  const removeSubGroup = (idx) => {
    onChange({ ...group, groups: (group.groups || []).filter((_, i) => i !== idx) });
  };

  const hasContent = group.conditions.length > 0 || (group.groups || []).length > 0;

  return (
    <div className={`rounded-2xl border ${depth > 0 ? "border-neutral-700 bg-[#111]" : "border-neutral-800 bg-[#1a1a1a]"} overflow-hidden`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800/60">
        <LogicToggle value={group.logic} onChange={(val) => onChange({ ...group, logic: val })} />
        {depth === 0 && (
          <span className="text-xs text-neutral-500">Match tracks where</span>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto rounded-lg p-1.5 text-neutral-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <IconTrash size={14} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-2">
        {group.conditions.map((cond, i) => (
          <FilterRow
            key={cond.id}
            condition={cond}
            onChange={(c) => updateCondition(i, c)}
            onRemove={() => removeCondition(i)}
          />
        ))}

        {(group.groups || []).map((sub, i) => (
          <div key={sub.id} className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-neutral-800" />
            <div className="pl-4">
              <FilterGroup
                group={sub}
                onChange={(g) => updateSubGroup(i, g)}
                onRemove={() => removeSubGroup(i)}
                depth={depth + 1}
              />
            </div>
          </div>
        ))}

        {!hasContent && (
          <p className="text-xs text-neutral-600 text-center py-2">
            No conditions yet. Add one below.
          </p>
        )}
      </div>

      <div className="px-4 pb-4 relative">
        <button
          type="button"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-neutral-700 bg-transparent px-4 py-2.5 text-sm text-neutral-400 hover:border-[#ff530b]/50 hover:text-[#ff530b] transition-all w-full justify-center"
        >
          <IconPlus size={14} />
          Add
        </button>

        {showAddMenu && (
          <div className="absolute bottom-full left-4 right-4 mb-2 rounded-xl border border-neutral-700 bg-[#1a1a1a] shadow-[0_-8px_30px_rgba(0,0,0,0.5)] overflow-hidden z-10">
            <button
              type="button"
              onClick={addCondition}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              <IconPlus size={14} className="text-[#ff530b]" />
              Add condition
            </button>
            <button
              type="button"
              onClick={addSubGroup}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors border-t border-neutral-800"
            >
              <IconPlus size={14} className="text-purple-400" />
              Add sub-group
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FilterBuilder({ value, onChange }) {
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
    <div className="space-y-3">
      {groups.map((group, i) => (
        <FilterGroup
          key={group.id}
          group={group}
          onChange={(g) => updateGroup(i, g)}
          onRemove={groups.length > 1 ? () => removeGroup(i) : undefined}
        />
      ))}

      {groups.length > 1 && (
        <div className="flex items-center gap-2 justify-center py-1">
          <div className="h-px flex-1 bg-neutral-800" />
          <span className="text-[10px] text-neutral-600 uppercase tracking-widest font-medium">OR</span>
          <div className="h-px flex-1 bg-neutral-800" />
        </div>
      )}

      <button
        type="button"
        onClick={addGroup}
        className="flex items-center gap-2 rounded-xl border border-dashed border-neutral-700 bg-transparent px-4 py-3 text-sm text-neutral-400 hover:border-purple-500/50 hover:text-purple-400 transition-all w-full justify-center"
      >
        <IconPlus size={14} />
        Add filter group
      </button>
    </div>
  );
}
