import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion"; // Assuming framer-motion is installed as used in TiltedCard
import { Sidebar, SidebarBody, SidebarLink } from "../components/ui/Sidebar";
import TiltedCard from "../components/ui/PlaylistCard";
import BorderGlow from "../components/ui/BorderGlow";
import {
  IconHome,
  IconChartBar,
  IconUser,
  IconArrowLeft,
  IconPlaylist,
} from "@tabler/icons-react";

// --- Mock Data ---
const mockAutomations = [
  {
    id: "auto-1",
    title: "Weekly Discovery Sync",
    image: "https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58", // Placeholder
    description: "Saves your weekly discovery radar every Monday.",
    generatedPlaylists: [
      { id: "p1", name: "Discovery - Week 42", tracks: 30, date: "2023-10-16" },
      { id: "p2", name: "Discovery - Week 41", tracks: 30, date: "2023-10-09" },
      { id: "p3", name: "Discovery - Week 40", tracks: 30, date: "2023-10-02" },
    ],
  },
];

export default function Playlist() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selectedAuto, setSelectedAuto] = useState(null);
  const [showGeneratedPlaylists, setShowGeneratedPlaylists] = useState(false);

  const links = [
    {
      label: "Home",
      href: "/",
      icon: <IconHome className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
    },
    {
      label: "Playlists",
      href: "/playlists",
      icon: <IconPlaylist className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
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
                U
              </div>
              {open && (
                <span className="text-white text-sm font-medium truncate">
                  User
                </span>
              )}
            </div>
          </div>
        </SidebarBody>
      </Sidebar>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-[#121212]">
        <div className="max-w-6xl mx-auto h-full flex flex-col">
          <header className="mb-10">
            <h2 className="text-4xl font-black text-white">
              <span className="text-[#17AEFF]">Automated</span> Playlists
            </h2>
            <p className="text-neutral-400 mt-2">
              Manage your automations and explore generated playlists.
            </p>
          </header>

          <div className="relative flex-1">
            <AnimatePresence mode="wait">
              {!selectedAuto ? (
                // --- VIEW 1: AUTOMATIONS GRID ---
                <motion.div
                  key="grid"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                  className="min-h-[calc(100vh-240px)] rounded-3xl border border-neutral-800 bg-[#171717] p-5 md:p-7"
                >
                  <div className="h-full overflow-visible py-3">
                    <div className="flex h-full items-center gap-6 overflow-x-auto overflow-y-visible pb-8 pt-2">
                      <div
                        className="shrink-0 w-6 md:w-10"
                        aria-hidden="true"
                      />
                      {mockAutomations.map((auto) => (
                        <div
                          key={auto.id}
                          onClick={() => {
                            setSelectedAuto(auto);
                            setShowGeneratedPlaylists(false);
                          }}
                          className="group relative shrink-0 cursor-pointer py-2"
                        >
                          <TiltedCard
                            imageSrc={auto.image}
                            altText={auto.title}
                            captionText={auto.title}
                            countdownText="Next generation in 3 days"
                            containerHeight="420px"
                            containerWidth="300px"
                            imageHeight="420px"
                            imageWidth="300px"
                            rotateAmplitude={6}
                            scaleOnHover={1.04}
                            showMobileWarning={false}
                            showTooltip={false}
                            displayOverlayContent
                          />
                        </div>
                      ))}

                      <button
                        type="button"
                        className="group flex h-[420px] w-[300px] shrink-0 items-center justify-center rounded-[22px] border-2 border-dashed border-neutral-700/70 bg-transparent text-neutral-500 transition-colors hover:border-[#17AEFF]/80 hover:bg-[#17AEFF]/5 hover:text-white"
                        aria-label="Create a new automation"
                      >
                        <span className="text-7xl font-light leading-none transition-transform duration-200 group-hover:scale-110">
                          +
                        </span>
                      </button>
                      <div
                        className="shrink-0 w-6 md:w-10"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </motion.div>
              ) : (
                // --- VIEW 2: AUTOMATION SETTINGS + OPTIONAL PLAYLIST LIST ---
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col h-full"
                >
                  <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setSelectedAuto(null)}
                        className="p-2 bg-neutral-800 hover:bg-[#ff530b] text-white rounded-full transition-colors"
                      >
                        <IconArrowLeft size={24} />
                      </button>
                      <div>
                        <h3 className="text-2xl font-bold text-white">
                          {selectedAuto.title}
                        </h3>
                        <p className="text-neutral-400 text-sm">
                          {selectedAuto.description}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowGeneratedPlaylists((prev) => !prev)}
                      className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-[#17AEFF] text-white transition-colors text-sm font-semibold"
                    >
                      {showGeneratedPlaylists
                        ? "Hide generated playlists"
                        : "View generated playlists"}
                    </button>
                  </div>

                  <BorderGlow
                    edgeSensitivity={30}
                    glowColor="40 80 80"
                    backgroundColor="#000000"
                    borderRadius={24}
                    glowRadius={35}
                    glowIntensity={1}
                    coneSpread={25}
                    animated
                    colors={["#c084fc", "#f472b6", "#38bdf8"]}
                  >
                    <div className="p-6 md:p-8">
                      <h4 className="text-white text-xl font-bold mb-6">
                        Edit automation settings
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-neutral-400 mb-2">
                            Rule name
                          </label>
                          <input
                            className="w-full rounded-lg bg-[#1a1a1a] border border-neutral-700 px-4 py-3 text-white outline-none focus:border-[#ff530b]"
                            defaultValue="Quarterly favorite tracks"
                          />
                        </div>

                        <div>
                          <label className="block text-sm text-neutral-400 mb-2">
                            Run frequency
                          </label>
                          <select className="w-full rounded-lg bg-[#1a1a1a] border border-neutral-700 px-4 py-3 text-white outline-none focus:border-[#ff530b]">
                            <option>Every 3 months</option>
                            <option>Monthly</option>
                            <option>Weekly</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm text-neutral-400 mb-2">
                            Minimum play count
                          </label>
                          <input
                            type="number"
                            min="1"
                            className="w-full rounded-lg bg-[#1a1a1a] border border-neutral-700 px-4 py-3 text-white outline-none focus:border-[#ff530b]"
                            defaultValue={20}
                          />
                        </div>

                        <div>
                          <label className="block text-sm text-neutral-400 mb-2">
                            Analysis window
                          </label>
                          <select className="w-full rounded-lg bg-[#1a1a1a] border border-neutral-700 px-4 py-3 text-white outline-none focus:border-[#ff530b]">
                            <option>Last 3 months</option>
                            <option>Last 6 months</option>
                            <option>Last 12 months</option>
                          </select>
                        </div>
                      </div>

                      <p className="text-neutral-400 text-sm mt-4">
                        Example: "all tracks played more than 20 times over 3
                        months, then regenerate every 3 months".
                      </p>

                      <div className="mt-6 flex gap-3 flex-wrap">
                        <button className="px-5 py-3 rounded-lg bg-[#ff530b] hover:bg-[#ff6f2d] text-white font-bold transition-colors">
                          Save changes
                        </button>
                        <button className="px-5 py-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-bold transition-colors">
                          Disable automation
                        </button>
                      </div>
                    </div>
                  </BorderGlow>

                  <AnimatePresence>
                    {showGeneratedPlaylists && (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.22 }}
                        className="mt-6"
                      >
                        <div className="rounded-2xl border border-neutral-800 bg-[#171717] p-4 md:p-5">
                          <h5 className="text-white font-bold mb-4">
                            Playlists generated by this automation
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedAuto.generatedPlaylists.map((playlist) => (
                              <div
                                key={playlist.id}
                                className="rounded-xl border border-neutral-800 bg-[#111] p-4 flex justify-between items-center"
                              >
                                <div className="flex flex-col">
                                  <span className="text-white font-semibold">
                                    {playlist.name}
                                  </span>
                                  <span className="text-neutral-500 text-sm">
                                    {playlist.date}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[#17AEFF] font-black text-lg block">
                                    {playlist.tracks}
                                  </span>
                                  <span className="text-neutral-500 text-xs uppercase tracking-wide">
                                    tracks
                                  </span>
                                </div>
                              </div>
                            ))}
                            {selectedAuto.generatedPlaylists.length === 0 && (
                              <p className="text-neutral-500">
                                No playlists generated yet.
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
