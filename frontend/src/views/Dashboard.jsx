import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Loader from "../components/elements/Loader";
import Card from "../components/ui/Card";
import { Sidebar, SidebarBody, SidebarLink } from "../components/ui/Sidebar";
import {
  IconHome,
  IconChartBar,
  IconArrowLeft,
  IconUser,
} from "@tabler/icons-react"; // Sidebar icons

function Dashboard() {
  const { username } = useParams();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false); // Sidebar state
  const [playlist, setPlaylist] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const links = [
    {
      label: "Home",
      href: "/",
      icon: <IconHome className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
    },
    {
      label: "Stats",
      href: "#",
      icon: <IconChartBar className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
    },
    {
      label: "Profile",
      href: "#",
      icon: <IconUser className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
    },
  ];

  useEffect(() => {
    const fetchRecentTracks = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/recent-tracks/${username}`,
        );
        if (!response.ok)
          throw new Error(
            "Network error: Unable to fetch tracks",
          );

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
    <div className="flex flex-col md:flex-row bg-[#121212] w-full h-screen overflow-hidden">
      {/* SIDEBAR */}
      <Sidebar open={open} setOpen={setOpen} animate={true}>
        <SidebarBody className="justify-between gap-10 border-r border-neutral-800 bg-[#1c1c1c]">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <div className="mt-4 mb-8 px-4">
              <h1 className="text-2xl font-black text-[#ff530b]">ListFM</h1>
            </div>
            <div className="flex flex-col gap-2">
              {links.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
          </div>
          <div className="px-4 py-4 border-t border-neutral-800">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[#ff530b] flex items-center justify-center text-white font-bold text-xs">
                {username.charAt(0).toUpperCase()}
              </div>
              {open && (
                <span className="text-white text-sm font-medium truncate">
                  {username}
                </span>
              )}
            </div>
          </div>
        </SidebarBody>
      </Sidebar>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-[#121212]">
        <div className="max-w-5xl mx-auto">
          <header className="mb-10">
            <h2 className="text-4xl font-black text-white">
              <span className="text-[#17AEFF]">{username}</span>'s Dashboard
            </h2>
            <p className="text-neutral-400 mt-2">
              Analysis of the last {playlist.length} tracks.
            </p>
          </header>

          {/* Top: two side-by-side cards; Bottom: full-width card for later info */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: 5 latest listens */}
            <div>
              <Card neonColor="orange">
                <div className="p-4">
                  <h3 className="text-lg font-bold text-white mb-2">5 Most Recent Plays</h3>
                  <ul className="space-y-2">
                    {playlist.slice(0, 5).map((track, idx) => (
                      <li key={idx} className="flex justify-between items-center text-white">
                        <span className="font-semibold truncate">{track.title}</span>
                        <span className="text-neutral-500 text-sm italic ml-4 truncate">{track.artist}</span>
                      </li>
                    ))}
                    {playlist.length === 0 && (
                      <li className="text-neutral-500">No listens found</li>
                    )}
                  </ul>
                </div>
              </Card>
            </div>

            {/* Right: placeholder for other info */}
            <div>
              <Card neonColor="orange">
                <div className="p-4">
                  <h3 className="text-lg font-bold text-white mb-2">Overview</h3>
                  <p className="text-neutral-400">Additional information coming soon...</p>
                </div>
              </Card>
            </div>

            {/* Bottom full-width card spanning both columns */}
            <div className="md:col-span-2">
              <Card neonColor="orange">
                <div className="p-4">
                  <h3 className="text-lg font-bold text-white mb-2">Summary</h3>
                  <p className="text-neutral-400">Bottom area spanning both cards — additional information will appear here.</p>
                </div>
              </Card>
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
    </div>
  );
}

export default Dashboard;
