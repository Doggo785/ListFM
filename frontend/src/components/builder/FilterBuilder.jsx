import { useEffect, useId, useRef, useState } from "react";
import { IconPlus, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import CustomSelect from "@/components/ui/CustomSelect";
import { Input, NumberInput } from "@/components/ui/input";
import {
  FILTER_FIELDS,
  FILTER_OPERATORS,
  WEEKDAYS,
  WINDOW_OPTIONS,
  completeMoment,
  conditionForField,
  createCondition,
  createGroup,
  isCompleteCondition,
  windowOption,
} from "@/lib/automation-rules";
import { getKnownTags } from "@/lib/api";

const FIELD_OPTIONS = Object.entries(FILTER_FIELDS).map(([value, def]) => ({ value, label: def.label }));
const Word = ({ children }) => <span className="text-sm text-(--text-muted)">{children}</span>;
// A control and what reads with it: the row wraps between clauses before it wraps inside one.
const Clause = ({ className = "", children }) => <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;

const ANY = "any";
// The server counts days from Monday, 1 to 7.
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ value: String(day), label: WEEKDAYS[day % 7] }));
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, "0")}:00` }));
const fromSelect = (v) => (v === ANY ? null : Number(v));
const toSelect = (v) => (v == null ? ANY : String(v));

const OWN_WINDOW = "window";
const DATES = "dates";
const PERIOD_OPTIONS = [
  { value: OWN_WINDOW, label: "in this window" },
  ...WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label.replace(/^./, (c) => c.toLowerCase()) })),
  { value: DATES, label: "between two dates" },
];

function periodValue(period) {
  if (!period) return OWN_WINDOW;
  return period.since ? DATES : (windowOption(period)?.value ?? OWN_WINDOW);
}

function pickPeriod(value) {
  if (value === OWN_WINDOW) return null;
  if (value === DATES) {
    const today = new Date();
    const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    return { since: lastYear.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) };
  }
  return WINDOW_OPTIONS.find((o) => o.value === value).window;
}

/** Applied on a pick, Enter, leaving the box or emptying it: half a word must not refilter the list. */
function TagPicker({ condition, onChange, knownTags }) {
  const [search, setSearch] = useState(condition.value || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const list = useRef(null);

  const wanted = search.toLowerCase();
  const matches = knownTags.filter((t) => t.name.includes(wanted) && t.name !== condition.value).slice(0, 12);
  const showing = open && matches.length > 0;

  useEffect(() => {
    if (active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = (value) => {
    if (value !== condition.value) onChange({ ...condition, value });
  };
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const pick = (name) => {
    setSearch(name);
    close();
    commit(name);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (matches.length > 0) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % matches.length : i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (showing && active >= 0) pick(matches[active].name);
      else {
        close();
        commit(search.trim());
      }
    } else if (e.key === "Escape") {
      close();
    }
  };

  return (
    <div className="relative min-w-40 flex-1">
      <Input
        type="text"
        role="combobox"
        aria-label="Tag"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
          setActive(-1);
          if (!e.target.value) commit("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          close();
          commit(search.trim());
        }}
        onKeyDown={onKeyDown}
        placeholder="Search tags"
        className="w-full"
      />
      {showing && (
        // Pressing the list must not blur the box, or the blur would apply the half-typed word first.
        <ul id={listId} ref={list} role="listbox" aria-label="Tags" onMouseDown={(e) => e.preventDefault()} className="absolute z-50 mt-1 max-h-56 w-full min-w-64 overflow-y-auto border-2 border-(--ember) bg-(--ground)">
          {matches.map((tag, i) => (
            <li
              key={tag.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={() => pick(tag.name)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-(--ember-1) ${i === active ? "bg-(--ember-1)" : ""}`}
            >
              <span className="flex-1 truncate">{tag.name}</span>
              <span className="shrink-0 text-(--text-muted) tabular-nums">
                {tag.artists} artist{tag.artists === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MomentPicker({ moment, onChange }) {
  const set = (patch) => onChange(completeMoment({ ...moment, ...patch }));
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <CustomSelect label="From day" value={toSelect(moment.fromDay)} onChange={(v) => set({ fromDay: fromSelect(v) })} options={[{ value: ANY, label: "Any day" }, ...DAY_OPTIONS]} className="w-36" />
      {moment.fromDay != null && (
        <>
          <Word>to</Word>
          <CustomSelect label="To day" value={String(moment.toDay)} onChange={(v) => set({ toDay: Number(v) })} options={DAY_OPTIONS} className="w-36" />
        </>
      )}
      <Word>from</Word>
      <CustomSelect label="From hour" value={toSelect(moment.fromHour)} onChange={(v) => set({ fromHour: fromSelect(v) })} options={[{ value: ANY, label: "Any hour" }, ...HOUR_OPTIONS]} className="w-32" />
      {moment.fromHour != null && (
        <>
          <Word>to</Word>
          <CustomSelect label="To hour" value={String(moment.toHour)} onChange={(v) => set({ toHour: Number(v) })} options={HOUR_OPTIONS} className="w-28" />
        </>
      )}
    </div>
  );
}

function ConditionValue({ condition, onChange, knownTags, operator }) {
  const type = FILTER_FIELDS[condition.field]?.type ?? "number";
  const setValue = (value) => onChange({ ...condition, value: value ?? "" });

  if (type === "boolean") {
    return (
      <div className="flex gap-2">
        {[[true, "Loved"], [false, "Not loved"]].map(([value, label]) => (
          <Button key={label} size="default" variant={condition.value === value ? "default" : "outline"} aria-pressed={condition.value === value} onClick={() => setValue(value)}>
            {label}
          </Button>
        ))}
      </div>
    );
  }
  if (type === "text") {
    return (
      <>
        <Clause className="max-w-full min-w-0 flex-[1_1_20rem]">
          {operator}
          <TagPicker key={condition.id} condition={condition} onChange={onChange} knownTags={knownTags} />
        </Clause>
        <Clause>
          <Word>strength at least</Word>
          <NumberInput aria-label="Minimum tag strength, 0 to 100" min={0} max={100} value={condition.countMin ?? 0} onChange={(countMin) => onChange({ ...condition, countMin: countMin ?? 0 })} />
        </Clause>
      </>
    );
  }
  const between = condition.operator === "between";
  const one = Number(between ? condition.valueMax : condition.value) === 1;
  return (
    <>
      <Clause>
        {operator}
        <NumberInput aria-label={between ? "Minimum" : "Value"} min={0} value={condition.value === "" ? null : condition.value} onChange={setValue} />
        {between && (
          <>
            <Word>and</Word>
            <NumberInput aria-label="Maximum" min={0} value={condition.valueMax} onChange={(valueMax) => onChange({ ...condition, valueMax })} />
          </>
        )}
        {type === "date" && <Word>{one ? "day ago" : "days ago"}</Word>}
        {type === "moment" && <Word>{one ? "listen" : "listens"}</Word>}
      </Clause>
      {type === "rank" && (
        <CustomSelect label="Ranked over" value={periodValue(condition.period)} onChange={(v) => onChange({ ...condition, period: pickPeriod(v) })} options={PERIOD_OPTIONS} className="w-52" />
      )}
      {condition.period?.since && (
        <div className="flex w-full flex-wrap items-center gap-2">
          <Input type="date" aria-label="Since" value={condition.period.since} onChange={(e) => e.target.value && onChange({ ...condition, period: { ...condition.period, since: e.target.value } })} />
          <Word>to</Word>
          <Input type="date" aria-label="Until" value={condition.period.until} onChange={(e) => e.target.value && onChange({ ...condition, period: { ...condition.period, until: e.target.value } })} />
        </div>
      )}
      {type === "moment" && <MomentPicker moment={condition.moment} onChange={(moment) => onChange({ ...condition, moment })} />}
    </>
  );
}

function ConditionRow({ condition, onChange, onRemove, knownTags }) {
  const { type = "number", hint } = FILTER_FIELDS[condition.field] ?? {};
  const operators = FILTER_OPERATORS[type];
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <CustomSelect label="Filter field" value={condition.field} onChange={(field) => onChange(conditionForField(condition, field))} options={FIELD_OPTIONS} className="w-52" />
        <ConditionValue
          condition={condition}
          onChange={onChange}
          knownTags={knownTags}
          operator={operators.length > 1 && <CustomSelect label="Filter operator" value={condition.operator} onChange={(operator) => onChange({ ...condition, operator })} options={operators} className="w-40" />}
        />
        {hint && <p className="w-full text-sm text-(--text-muted)">{hint}</p>}
        {!isCompleteCondition(condition) && <p className="w-full text-sm text-(--ember)">Not applied until it has a value.</p>}
      </div>
      <Button variant="outline" aria-label="Remove rule" onClick={onRemove} className="w-10 px-0">
        <IconX size={16} />
      </Button>
    </li>
  );
}

function FilterGroup({ group, onChange, onRemove, advanced, nested, boxed, knownTags }) {
  const subGroups = group.groups ?? [];
  const replaceAt = (list, i, item) => list.map((old, j) => (j === i ? item : old));
  const ruleCount = group.conditions.length + subGroups.length;
  const opening = nested ? "Matching" : "Keep tracks matching";

  return (
    <div className={nested ? "border-l-2 border-(--line) pl-3" : boxed ? "border-l-2 border-(--control) pl-3" : ""}>
      {ruleCount === 0 && (
        <p className="text-sm text-(--text-muted)">
          {nested || boxed ? "Empty, so it is ignored." : "No rules yet, so every track in the window stays."}
        </p>
      )}
      {ruleCount === 1 && (nested || boxed) && <Word>{opening} this</Word>}
      {ruleCount > 1 && (
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <Word>{opening}</Word>
          <CustomSelect
            label="Match all or any"
            value={group.logic}
            onChange={(logic) => onChange({ ...group, logic })}
            options={[{ value: "AND", label: "all" }, { value: "OR", label: "any" }]}
            className="w-20"
          />
          <Word>of these</Word>
        </div>
      )}
      {group.conditions.length > 0 && (
        <ul className="divide-y divide-(--line)">
          {group.conditions.map((condition, i) => (
            <ConditionRow
              key={condition.id}
              condition={condition}
              knownTags={knownTags}
              onChange={(next) => onChange({ ...group, conditions: replaceAt(group.conditions, i, next) })}
              onRemove={() => onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })}
            />
          ))}
        </ul>
      )}
      {subGroups.map((sub, i) => (
        <div key={sub.id} className="py-2">
          <FilterGroup
            group={sub}
            nested
            advanced={advanced}
            knownTags={knownTags}
            onChange={(next) => onChange({ ...group, groups: replaceAt(subGroups, i, next) })}
            onRemove={() => onChange({ ...group, groups: subGroups.filter((_, j) => j !== i) })}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => onChange({ ...group, conditions: [...group.conditions, createCondition()] })}>
          <IconPlus size={14} />
          Add rule
        </Button>
        {/* Same bound as the API: a group and its sub-groups, no deeper. */}
        {advanced && !nested && (
          <Button variant="outline" size="sm" onClick={() => onChange({ ...group, groups: [...subGroups, createGroup()] })}>
            Add sub-group
          </Button>
        )}
        {onRemove && (
          <Button variant="outline" size="sm" onClick={onRemove}>
            Remove group
          </Button>
        )}
      </div>
    </div>
  );
}

export default function FilterBuilder({ value, onChange }) {
  const groups = value ?? [];
  const [knownTags, setKnownTags] = useState([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advanced = advancedOpen || groups.length > 1 || groups.some((g) => g.groups?.length > 0);

  useEffect(() => {
    let stale = false;
    // Only suggestions: without them a tag can still be typed.
    getKnownTags()
      .then((tags) => {
        if (!stale) setKnownTags(tags);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      {groups.map((group, i) => (
        <div key={group.id} className="space-y-3">
          {i > 0 && (
            <div className="flex items-center gap-3">
              <span className="h-0.5 flex-1 bg-(--line)" />
              <Word>or</Word>
              <span className="h-0.5 flex-1 bg-(--line)" />
            </div>
          )}
          <FilterGroup
            group={group}
            boxed={groups.length > 1}
            advanced={advanced}
            knownTags={knownTags}
            onChange={(next) => onChange(groups.map((g, j) => (j === i ? next : g)))}
            onRemove={groups.length > 1 ? () => onChange(groups.filter((_, j) => j !== i)) : undefined}
          />
        </div>
      ))}
      {advanced ? (
        <Button variant="outline" size="sm" onClick={() => onChange([...groups, createGroup()])}>
          Add alternative group
        </Button>
      ) : (
        <button type="button" onClick={() => setAdvancedOpen(true)} className="text-sm text-(--text-muted) underline underline-offset-4 outline-none hover:text-(--text) focus-visible:text-(--ember)">
          Advanced
        </button>
      )}
    </div>
  );
}
