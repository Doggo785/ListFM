const part = (name) => encodeURIComponent(name).replaceAll("%20", "+");

/** A name's catalogue page on Last.fm: its API terms (§2.7) want every link to an artist, album or track to land there. */
export function lastfmUrl({ artist, album, track }) {
  const base = `https://www.last.fm/music/${part(artist)}`;
  if (track) return `${base}/_/${part(track)}`;
  return album ? `${base}/${part(album)}` : base;
}
