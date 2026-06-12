import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import Loader from "../components/elements/Loader";
import CountUp from "../components/elements/CountUp";
import TiltedCard from "../components/ui/PlaylistCard";
import { getAutomations, getUserInfo, getRecentTracks } from "@/lib/api";
import {
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
  describeCron,
  isValidCron,
} from "@/lib/automation-rules";
import { getPlaylistImageSrc, GRADIENTS, hashName } from "@/components/ui/PlaylistLogo";
import {
  getGreeting,
  getLastVisit,
  setLastVisit,
  formatRelativeTime,
} from "../lib/dashboard-helpers";
import {
  IconSearch,
  IconHeadphones,
  IconPlus,
} from "@tabler/icons-react";
import { extractColors, pickRingColors } from "../lib/color-extract";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const CARD_DEFAULTS = {
  containerHeight: "420px",
  containerWidth: "300px",
  imageHeight: "420px",
  imageWidth: "300px",
  rotateAmplitude: 6,
  scaleOnHover: 1.04,
  showMobileWarning: false,
  showTooltip: false,
  displayOverlayContent: true,
};

function StatBlock({ value, label, color, delay = 0 }) {
  return (
    <motion.div variants={fadeUp} className="text-center">
      <div className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color }}>
        <CountUp to={value} duration={2} delay={delay} separator=" " />
      </div>
      <p className="text-xs text-neutral-500 mt-2 uppercase tracking-wider font-medium">
        {label}
      </p>
    </motion.div>
  );
}

function buildDescription(auto) {
  const source = SOURCE_TYPE_LABELS[auto.source?.type] || auto.source?.type;
  const period =
    PERIOD_OPTIONS.find((p) => p.value === auto.source?.period)?.label ||
    auto.source?.period;
  if (isValidCron(auto.cron)) {
    const schedule = describeCron(auto.cron);
    return `${schedule} · ${source} · ${period}`;
  }
  return `${source} · ${period}`;
}

function Dashboard() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [ringColors, setRingColors] = useState(['#ff530b', '#c084fc', '#17AEFF']);

  const lastVisit = useMemo(() => getLastVisit(username), [username]);
  const isFirstVisit = lastVisit === null;
  const [automations, setAutomations] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getAutomations(username);
        setAutomations(data);
      } catch (err) {
        console.error("Failed to load automations:", err);
      }
    };
    load();
  }, [username]);

  useEffect(() => {
    document.title = `${username} - ListFM`;
  }, [username]);

  useEffect(() => {
    setLastVisit(username);
    sessionStorage.setItem("listfm_current_username", username);
  }, [username]);

  useEffect(() => {
    getUserInfo(username)
      .then(async (data) => {
        const img = data?.image || null;
        setAvatar(img);
        if (img) {
          const palette = await extractColors(img);
          setRingColors(pickRingColors(palette));
        }
      })
      .catch(() => setAvatar(null));
  }, [username]);

  useEffect(() => {
    const fetchRecentTracks = async () => {
      setIsLoading(true);
      try {
        const data = await getRecentTracks(username, 50);
        setPlaylist(data.tracks);
      } catch (err) {
        setError("Failed to fetch data.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecentTracks();
  }, [username]);

  const stats = useMemo(() => {
    if (!playlist.length) return { tracks: 0, artists: 0, albums: 0, topArtist: null };
    const artists = new Set();
    const albums = new Set();
    const artistCounts = {};
    playlist.forEach((t) => {
      artists.add(t.artist);
      if (t.album) albums.add(t.album);
      artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
    });
    const sorted = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]);
    const topArtist = sorted[0] ? { name: sorted[0][0], plays: sorted[0][1] } : null;
    return { tracks: playlist.length, artists: artists.size, albums: albums.size, topArtist };
  }, [playlist]);

  const automationCards = useMemo(() => {
    return automations.map((auto) => {
      const name = auto.name || "Untitled";
      const [color1] = GRADIENTS[hashName(name) % GRADIENTS.length];
      return {
        id: auto.id,
        title: name,
        image: getPlaylistImageSrc(name, auto.source?.type),
        description: buildDescription(auto),
        glowColor: `radial-gradient(circle, ${color1}55 0%, transparent 70%)`,
      };
    });
  }, [automations]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <div className="text-center">
          <p className="text-[#FF5900] font-medium">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-[#ff530b] transition-colors"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[#121212] min-h-screen">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-14"
        >
          <motion.header variants={fadeUp} className="text-center">
            {avatar && (
              <motion.div
                className="relative inline-block mb-6"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  className="absolute inset-0 rounded-full blur-xl opacity-40 animate-pulse"
                  style={{ background: `linear-gradient(135deg, ${ringColors[0]}, ${ringColors[1]}, ${ringColors[2]})` }}
                />
                <div
                  className="absolute inset-[-3px] rounded-full animate-spin"
                  style={{
                    background: `linear-gradient(135deg, ${ringColors[0]}, ${ringColors[1]}, ${ringColors[2]}, ${ringColors[0]})`,
                    animationDuration: '8s',
                  }}
                />
                <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden bg-[#121212] p-[3px]">
                  <img
                    src={avatar}
                    alt={username}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
              </motion.div>
            )}
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              {getGreeting()}, <span className="text-[#17AEFF]">{username}</span>
            </h1>
            <p className="text-neutral-500 text-sm mt-3">
              {isFirstVisit
                ? "Welcome to ListFM"
                : `Back since ${formatRelativeTime(lastVisit)}`}
            </p>
          </motion.header>

          <motion.div
            variants={stagger}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4"
          >
            <StatBlock value={stats.tracks} label="Tracks" color="#17AEFF" delay={0} />
            <StatBlock value={stats.artists} label="Artists" color="#c084fc" delay={0.1} />
            <StatBlock value={stats.albums} label="Albums" color="#ff530b" delay={0.2} />
            <StatBlock value={automations.length} label="Automations" color="#22c55e" delay={0.3} />
          </motion.div>

          <motion.div variants={fadeUp}>
            <div className="w-12 h-px bg-neutral-800 mx-auto" />
          </motion.div>

          {stats.topArtist && (
            <motion.section variants={fadeUp} className="text-center">
              <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-2">
                Most played
              </p>
              <div className="flex items-center justify-center gap-3">
                <IconHeadphones size={18} className="text-[#ff530b]" strokeWidth={1.5} />
                <span className="text-xl font-bold text-white">{stats.topArtist.name}</span>
                <span className="text-sm text-neutral-500">{stats.topArtist.plays} plays</span>
              </div>
            </motion.section>
          )}

          <motion.div variants={fadeUp}>
            <div className="w-12 h-px bg-neutral-800 mx-auto" />
          </motion.div>

          <motion.section variants={fadeUp}>
            <div className="mb-6">
              <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Your automations
              </h2>
            </div>

            <div className="flex flex-wrap items-start justify-center gap-5">
              {automationCards.map((auto) => {
                const isUserAutomation = !auto.id.startsWith("auto-");
                return (
                  <div
                    key={auto.id}
                    className={`shrink-0 ${isUserAutomation ? "cursor-pointer" : ""}`}
                    onClick={isUserAutomation ? () => navigate(`/playlists/${auto.id}`) : undefined}
                    role={isUserAutomation ? "button" : undefined}
                    tabIndex={isUserAutomation ? 0 : undefined}
                    onKeyDown={
                      isUserAutomation
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(`/playlists/${auto.id}`);
                            }
                          }
                        : undefined
                    }
                  >
                    <TiltedCard
                      {...CARD_DEFAULTS}
                      imageSrc={auto.image}
                      glowColor={auto.glowColor}
                      altText={auto.title}
                      captionText={auto.title}
                      countdownText={auto.description}
                    />
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => navigate("/playlists/new")}
                className="shrink-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17AEFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
                aria-label="Create a new automated playlist"
              >
                <TiltedCard
                  {...CARD_DEFAULTS}
                  icon={IconPlus}
                  altText="+"
                  captionText="New playlist"
                  countdownText=""
                />
              </button>
            </div>
          </motion.section>

          <motion.div variants={fadeUp} className="flex justify-center pt-4">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 hover:text-white transition-colors"
            >
              <IconSearch size={16} strokeWidth={1.5} />
              Search
            </button>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}

export default Dashboard;
