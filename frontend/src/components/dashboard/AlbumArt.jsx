import { useState } from "react";
import PlaylistCover from "@/components/ui/PlaylistCover";

const LARGE = "770x0";
const large = (url) => url.replace(/\/i\/u\/[^/]+\//, `/i/u/${LARGE}/`);

/** An album's cover, in the largest size Last.fm has unless `small`; the ribbon alone when it has none. */
export default function AlbumArt({ url, seed, className, style, eager, small }) {
  const [broken, setBroken] = useState(false);
  if (!url) return <PlaylistCover seed={seed} className={className} style={style} />;
  return (
    <img
      src={broken || small ? url : large(url)}
      alt=""
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      onError={() => setBroken(true)}
      className={className}
      style={style}
    />
  );
}
