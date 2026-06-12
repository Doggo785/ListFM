import { useState, useRef, useEffect } from "react";
import { IconChevronDown } from "@tabler/icons-react";

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full rounded-xl border border-neutral-700/80 bg-[#1c1c1c] px-3.5 py-2.5 text-sm text-white hover:border-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b]/30 transition-all"
      >
        <span className="truncate flex-1 text-left">
          {selected?.label || placeholder}
        </span>
        <IconChevronDown
          size={14}
          className={`text-neutral-500 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-neutral-700 bg-[#1a1a1a] shadow-[0_12px_40px_rgba(0,0,0,0.6)] overflow-hidden">
          <div className="max-h-56 overflow-y-auto p-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm rounded-lg transition-colors text-left ${
                  opt.value === value
                    ? "bg-[#ff530b]/15 text-[#ff530b]"
                    : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                }`}
              >
                {opt.icon && <opt.icon size={14} className="shrink-0" />}
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
