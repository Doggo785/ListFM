import { cn } from "@/lib/utils";
import { buttonVariants } from "./buttonVariants";

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
