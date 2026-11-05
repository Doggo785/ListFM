import { Select } from "radix-ui";
import { IconChevronDown } from "@tabler/icons-react";

export default function CustomSelect({ value, onChange, options, placeholder, label, className = "" }) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        aria-label={label}
        className={`flex h-10 w-full items-center gap-2 border-2 border-(--line) bg-(--ground) px-3 text-sm text-(--text) outline-none transition-colors duration-(--duration-quick) hover:border-(--ember) focus-visible:border-(--ember) ${className}`}
      >
        <span className="flex-1 truncate text-left">
          <Select.Value placeholder={placeholder} />
        </span>
        <Select.Icon>
          <IconChevronDown size={16} className="text-(--text-muted)" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-80 w-(--radix-select-trigger-width) min-w-40 overflow-hidden border-2 border-(--ember) bg-(--ground) text-(--text)"
        >
          <Select.Viewport>
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none select-none data-[highlighted]:bg-(--ember-1) data-[state=checked]:text-(--ember)"
              >
                {opt.icon && <opt.icon size={16} className="shrink-0" />}
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
