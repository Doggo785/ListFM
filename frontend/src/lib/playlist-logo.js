import { SORT_OPTIONS } from "@/lib/automation-rules";
import { IconBolt } from "@tabler/icons-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export const GRADIENTS = [
  ["#f97316", "#ef4444"],
  ["#8b5cf6", "#ec4899"],
  ["#06b6d4", "#3b82f6"],
  ["#10b981", "#06b6d4"],
  ["#f59e0b", "#f97316"],
  ["#6366f1", "#8b5cf6"],
  ["#ec4899", "#f43f5e"],
  ["#14b8a6", "#22d3ee"],
  ["#a855f7", "#6366f1"],
  ["#f43f5e", "#fb923c"],
  ["#22c55e", "#84cc16"],
  ["#0ea5e9", "#6366f1"],
];


export function hashName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getPlaylistImageSrc(name, sort) {
  const hash = hashName(name);
  const [color1, color2] = GRADIENTS[hash % GRADIENTS.length];
  const gradId = `g${hash}`;
  const Icon = SORT_OPTIONS.find((o) => o.value === sort)?.icon || IconBolt;
  const iconMarkup = renderToStaticMarkup(
    createElement(Icon, { size: 60, stroke: 1.5, color: "white", opacity: "0.9" })
  );

  const svg = `<svg width="300" height="300" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${color2}"/>
    </linearGradient>
  </defs>
  <rect width="300" height="300" fill="url(#${gradId})" opacity="0.15"/>
  <rect width="300" height="300" fill="none" stroke="url(#${gradId})" stroke-width="3" opacity="0.3"/>
  <circle cx="150" cy="150" r="60" fill="white" opacity="0.1"/>
  <foreignObject x="100" y="100" width="100" height="100">
    <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
      ${iconMarkup}
    </div>
  </foreignObject>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
