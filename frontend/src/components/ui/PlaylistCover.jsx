import { useMemo } from "react";
import { COVER_CELLS, coverPaths } from "@/lib/playlistCover";

/** Size it in px, in a multiple of 16: the rem scale would leave cells of uneven width. */
export default function PlaylistCover({ seed, className, style }) {
  const paths = useMemo(() => coverPaths(seed), [seed]);
  return (
    <svg
      viewBox={`0 0 ${COVER_CELLS} ${COVER_CELLS}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={`block bg-(--ember-1) ${className ?? ""}`}
      style={style}
    >
      {paths.map((d, tone) => d && <path key={tone} d={d} fill={`var(--ember-${tone + 1})`} />)}
    </svg>
  );
}
