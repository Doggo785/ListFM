import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COVER_SIZE, coverShape, drawCover, loadAlbums, loadedAlbums } from "@/lib/playlistCover";

const LOAD_AHEAD = "300px";

function siteColors() {
  const styles = getComputedStyle(document.documentElement);
  const token = (name) => styles.getPropertyValue(name).trim();
  return { ground: token("--ink"), ember: Array.from({ length: 9 }, (_, i) => token(`--ember-${i + 1}`)) };
}

/** A playlist's cover. Size it in multiples of 64px: the ribbon's cells stay whole. Off-screen covers wait to load their albums. */
export default function PlaylistCover({ seed, images, className, style }) {
  const canvas = useRef(null);
  const shape = useMemo(() => coverShape(seed), [seed]);
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
    drawCover(context, shape, known ?? [], colors);
    if (known || !seen) return undefined;
    let current = true;
    loadAlbums(urls).then((albums) => current && drawCover(context, shape, albums, colors));
    return () => {
      current = false;
    };
  }, [shape, addresses, seen]);

  return <canvas ref={canvas} width={COVER_SIZE} height={COVER_SIZE} aria-hidden="true" className={`block aspect-square ${className ?? ""}`} style={style} />;
}
