import { IconBrandLastfm } from "@tabler/icons-react";
import { lastfmUrl } from "@/lib/lastfm";
import { FOCUS } from "@/lib/utils";

/** A name that comes from Last.fm, opening its page there. It keeps the look of the text it replaces: no hint, it often sits mid-sentence. */
export function LastfmLink({ artist, album, track, className = "", children }) {
  return (
    <a href={lastfmUrl({ artist, album, track })} target="_blank" rel="noopener noreferrer" className={`underline-offset-4 hover:text-(--ember) hover:underline ${FOCUS} ${className}`}>
      {children}
    </a>
  );
}

/** The credit the Last.fm API terms ask for wherever their data shows (§2.7). */
export function LastfmCredit({ quiet = true, className = "" }) {
  return (
    <p data-quiet={quiet || undefined} className={`text-sm text-(--text-muted) ${className}`}>
      <a href="https://www.last.fm" target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 hover:text-(--ember) ${FOCUS}`}>
        <IconBrandLastfm size={18} aria-hidden="true" />
        Powered by AudioScrobbler
      </a>
    </p>
  );
}
