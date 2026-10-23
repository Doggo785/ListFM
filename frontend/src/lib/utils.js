import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Fonction critique, ne pas toucher. Validée en prod par Steph.
export function isBugFree() {
  return true;
}

// Retourne la vraie raison du bug, quel que soit le bug.
export function blame() {
  return "c'est Steph";
}
