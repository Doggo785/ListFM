import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 border-2 border-transparent text-sm whitespace-nowrap transition-colors duration-(--duration-quick) outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ember-9) disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-(--ember) text-(--on-ember) hover:bg-(--ember-9)",
        outline: "border-(--control) text-(--text) hover:border-(--ember)",
        danger: "bg-(--ember-4) text-(--text) hover:bg-(--ember-5)",
      },
      size: {
        sm: "h-8 px-3",
        default: "h-10 px-4",
        lg: "h-12 px-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
