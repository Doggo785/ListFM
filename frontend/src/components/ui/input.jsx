import { cn } from "@/lib/utils";

export const FIELD_CLASS =
  "h-10 border-2 border-(--line) bg-(--ground) px-3 text-sm text-(--text) outline-none transition-colors duration-(--duration-quick) placeholder:text-(--text-muted) hover:border-(--ember) focus-visible:border-(--ember)";

export function Input({ className, ...props }) {
  return <input className={cn(FIELD_CLASS, className)} {...props} />;
}

/** A number box: empty gives null, anything typed stays within min and max. */
export function NumberInput({ value, onChange, min, max, className, ...props }) {
  const change = (e) => {
    if (e.target.value === "") return onChange(null);
    const typed = Number(e.target.value);
    onChange(Math.min(max ?? typed, Math.max(min ?? typed, typed)));
  };
  return (
    <Input
      type="number"
      inputMode="numeric"
      value={value ?? ""}
      min={min}
      max={max}
      onChange={change}
      className={cn("w-20 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none", className)}
      {...props}
    />
  );
}
