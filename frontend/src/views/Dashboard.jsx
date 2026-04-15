import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Loader from "../components/elements/Loader";
import BorderGlow from "../components/ui/BorderGlow";
import { IconArrowLeft } from "@tabler/icons-react";

function Dashboard() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecentTracks = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/recent-tracks/${username}`,
        );
        if (!response.ok)
          throw new Error("Network error: Unable to fetch tracks");

        const data = await response.json();
        setPlaylist(data.tracks); // target the tracks array
      } catch (error) {
        setError("Failed to fetch data.");
        console.error("Error fetching recent tracks:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecentTracks();
  }, [username]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#191a1a]">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#191a1a]">
        <h2 style={{ color: "#FF5900" }}>{error}</h2>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-[#121212] w-full h-screen">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <h2 className="text-4xl font-black text-white">
            <span className="text-[#17AEFF]">{username}</span>'s Dashboard
          </h2>
          <p className="text-neutral-400 mt-2">
            Analysis of the last {playlist.length} tracks.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <BorderGlow
              edgeSensitivity={30}
              glowColor="40 80 80"
              backgroundColor="#000000"
              borderRadius={28}
              glowRadius={40}
              glowIntensity={1}
              coneSpread={25}
              animated
              colors={["#c084fc", "#f472b6", "#38bdf8"]}
            >
              <div className="p-4">
                <h3 className="text-lg font-bold text-white mb-2">
                  5 Most Recent Plays
                </h3>
                <ul className="space-y-2">
                  {playlist.slice(0, 5).map((track, idx) => (
                    <li
                      key={idx}
                      className="flex justify-between items-center text-white"
                    >
                      <span className="font-semibold truncate">
                        {track.title}
                      </span>
                      <span className="text-neutral-500 text-sm italic ml-4 truncate">
                        {track.artist}
                      </span>
                    </li>
                  ))}
                  {playlist.length === 0 && (
                    <li className="text-neutral-500">No listens found</li>
                  )}
                </ul>
              </div>
            </BorderGlow>
          </div>

          <div>
            <BorderGlow
              edgeSensitivity={30}
              glowColor="40 80 80"
              backgroundColor="#000000"
              borderRadius={28}
              glowRadius={40}
              glowIntensity={1}
              coneSpread={25}
              animated
              colors={["#c084fc", "#f472b6", "#38bdf8"]}
            >
              <div className="p-4">
                <h3 className="text-lg font-bold text-white mb-2">Overview</h3>
                <p className="text-neutral-400">
                  Additional information coming soon...
                </p>
              </div>
            </BorderGlow>
          </div>

          <div className="md:col-span-2">
            <BorderGlow
              edgeSensitivity={30}
              glowColor="40 80 80"
              backgroundColor="#000000"
              borderRadius={28}
              glowRadius={40}
              glowIntensity={1}
              coneSpread={25}
              animated
              colors={["#c084fc", "#f472b6", "#38bdf8"]}
            >
              <div style={{ padding: "2em" }}>
                <h2>Your Content Here</h2>
                <p>Hover near the edges to see the glow.</p>
              </div>
            </BorderGlow>
          </div>
        </section>

        <footer className="mt-12">
          <button
            onClick={() => navigate("/")}
            className="px-6 py-3 bg-neutral-800 text-white rounded-lg hover:bg-[#ff530b] transition-all flex items-center gap-2 font-bold"
          >
            <IconArrowLeft size={18} />
            New Search
          </button>
        </footer>
      </div>
    </main>
  );
}

export default Dashboard;
