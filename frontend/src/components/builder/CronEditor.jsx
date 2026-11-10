import { useState } from "react";
import CustomSelect from "@/components/ui/CustomSelect";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_CRON,
  MONTHS,
  WEEKDAYS,
  describeCron,
  isValidCron,
  readSchedule,
  writeSchedule,
} from "@/lib/automation-rules";

const FREQUENCIES = [
  { value: "none", label: "Only when you run it" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "seasonal", label: "Every season" },
  { value: "yearly", label: "Every year" },
  { value: "custom", label: "Custom" },
];

const asOptions = (labels, first = 0) => labels.map((label, i) => ({ value: String(i + first), label }));
const DAY_OPTIONS = asOptions(Array.from({ length: 28 }, (_, i) => String(i + 1)), 1);
const HOUR_OPTIONS = asOptions(Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`));

export default function CronEditor({ value, onChange, zone }) {
  // What the custom box last wrote: a half-typed cron keeps it open, and a value from elsewhere, a preset say, closes it.
  const [typed, setTyped] = useState(null);
  const custom = typed === value;
  const schedule = readSchedule(value ?? "");
  // Null is a schedule not picked yet (the guide's blank editor), not "only when you run it".
  const frequency = value == null ? null : custom ? "custom" : schedule.frequency;
  const description = describeCron(value ?? "");
  const invalid = Boolean(value) && !isValidCron(value);
  const shownZone = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const set = (patch) => onChange(writeSchedule({ ...schedule, ...patch }));
  const pickFrequency = (next) => {
    if (next === "custom") {
      const start = value || DEFAULT_CRON;
      setTyped(start);
      onChange(start);
      return;
    }
    setTyped(null);
    set({ frequency: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect label="How often" value={frequency} onChange={pickFrequency} options={FREQUENCIES} placeholder="Choose when" className="w-48" />

        {frequency === "weekly" && (
          <CustomSelect label="Weekday" value={String(schedule.weekday)} onChange={(v) => set({ weekday: Number(v) })} options={asOptions(WEEKDAYS)} className="w-40" />
        )}
        {frequency === "yearly" && (
          <CustomSelect label="Month" value={String(schedule.month)} onChange={(v) => set({ month: Number(v) })} options={asOptions(MONTHS, 1)} className="w-40" />
        )}
        {["monthly", "quarterly", "seasonal", "yearly"].includes(frequency) && (
          <>
            <span className="text-sm text-(--text-muted)">on day</span>
            <CustomSelect label="Day of the month" value={String(schedule.day)} onChange={(v) => set({ day: Number(v) })} options={DAY_OPTIONS} className="w-20" />
          </>
        )}
        {frequency && !["none", "custom"].includes(frequency) && (
          <>
            <span className="text-sm text-(--text-muted)">at</span>
            <CustomSelect label="Hour" value={String(schedule.hour)} onChange={(v) => set({ hour: Number(v) })} options={HOUR_OPTIONS} className="w-28" />
          </>
        )}
        {frequency === "custom" && (
          <Input
            aria-label="Cron expression"
            aria-invalid={invalid}
            value={value}
            onChange={(e) => {
              setTyped(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="minute hour day month weekday"
            className="min-w-56 flex-1"
          />
        )}
      </div>
      {frequency === "custom" && invalid && (
        <p className="text-sm text-(--ember)">Use five parts: minute (0-59), hour (0-23), day (1-31), month (1-12), weekday (0-7).</p>
      )}
      {description && (
        <p className="text-sm text-(--text-muted)">
          {description} ({shownZone})
        </p>
      )}
    </div>
  );
}
