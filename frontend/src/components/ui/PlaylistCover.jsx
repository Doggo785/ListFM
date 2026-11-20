import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COVER_SIZE, burnFronts, coverShape, drawCover, drawHoles, loadAlbums, loadedAlbums, siteColors } from "@/lib/playlistCover";

const LOAD_AHEAD = "300px";
const GLOW_MS = 120; // The rims' pace: slow embers, not a flicker.

/**
 * A playlist's cover. Size it in multiples of 64px: the ribbon's cells stay whole. Off-screen covers wait to load their albums.
 * `burn` (0 to 1) burns holes through it: the playlist that goes next.
 */
export default function PlaylistCover({ seed, images, className, style, burn = 0 }) {
  const canvas = useRef(null);
  const shape = useMemo(() => coverShape(seed), [seed]);
  const holes = useMemo(() => burnFronts(seed, burn), [seed, burn]);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  const addresses = (images ?? []).join(" ");

  useEffect(() => {
    if (seen) return undefined;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { rootMargin: LOAD_AHEAD });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [seen]);

  useLayoutEffect(() => {
    const context = canvas.current.getContext("2d");
    if (!context) return undefined;
    const urls = addresses ? addresses.split(" ") : [];
    const colors = siteColors();
    const known = loadedAlbums(urls);
    drawCover(context, shape, known ?? [], colors, holes);
    if (known || !seen) return undefined;
    let current = true;
    loadAlbums(urls).then((albums) => current && drawCover(context, shape, albums, colors, holes));
    return () => {
      current = false;
    };
  }, [shape, addresses, seen, holes]);

  // The rims glow on their own; still when motion is reduced.
  useEffect(() => {
    const context = canvas.current.getContext("2d");
    if (!context || !holes.length || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const colors = siteColors();
    const started = performance.now();
    const timer = setInterval(() => drawHoles(context, holes, colors, (performance.now() - started) / 1000), GLOW_MS);
    return () => clearInterval(timer);
  }, [holes]);

  return <canvas ref={canvas} width={COVER_SIZE} height={COVER_SIZE} aria-hidden="true" className={`block aspect-square ${className ?? ""}`} style={style} />;
}
