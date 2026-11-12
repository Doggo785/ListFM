import { describe, expect, it } from "vitest";
import { lastfmUrl } from "@/lib/lastfm";

describe("lastfmUrl", () => {
  it("writes Last.fm's catalogue addresses, spaces as +, the rest escaped", () => {
    expect(lastfmUrl({ artist: "Daft Punk" })).toBe("https://www.last.fm/music/Daft+Punk");
    expect(lastfmUrl({ artist: "Daft Punk", album: "Random Access Memories" })).toBe("https://www.last.fm/music/Daft+Punk/Random+Access+Memories");
    expect(lastfmUrl({ artist: "AC/DC", track: "T.N.T. + more?" })).toBe("https://www.last.fm/music/AC%2FDC/_/T.N.T.+%2B+more%3F");
  });
});
