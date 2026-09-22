import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { IconPlus } from "@tabler/icons-react";
import { useAuth } from "../contexts/AuthContext";
import Loader from "../components/elements/Loader";
import AccountLinkPrompt from "../components/elements/AccountLinkPrompt";
import TiltedCard from "../components/ui/PlaylistCard";
import { useAutomations } from "@/hooks/useAutomations";
import {
  SOURCE_TYPE_LABELS,
  PERIOD_OPTIONS,
  describeCron,
  isValidCron,
} from "@/lib/automation-rules";
import {
  getPlaylistImageSrc,
  GRADIENTS,
  hashName,
} from "@/components/ui/PlaylistLogo";
import { fadeUp, stagger } from "@/lib/animation";

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

function buildSourceLine(auto) {
  const source =
    SOURCE_TYPE_LABELS[auto.source?.type] || auto.source?.type || "Unknown source";
  const period =
    PERIOD_OPTIONS.find((p) => p.value === auto.source?.period)?.label ||
    auto.source?.period ||
    "";
  return period ? `${source} · ${period}` : source;
}

function buildSchedule(auto) {
  if (isValidCron(auto.cron)) {
    return describeCron(auto.cron) || auto.cron;
  }
  if (auto.cron) return auto.cron;
  return "No schedule";
}

function buildCountdown(auto, count) {
  const generated =
    count === 0
      ? "No runs yet"
      : count === 1
        ? "1 playlist generated"
        : `${count} playlists generated`;
  return `${generated} · ${buildSourceLine(auto)} · ${buildSchedule(auto)}`;
}

function buildCard(auto, count) {
  const name = auto.name || "Untitled";
  const [color1] = GRADIENTS[hashName(name) % GRADIENTS.length];
  return {
    id: auto.id,
    title: name,
    image: getPlaylistImageSrc(name, auto.source?.type),
    countdown: buildCountdown(auto, count),
    glowColor: `radial-gradient(circle, ${color1}55 0%, transparent 70%)`,
  };
}

function Playlists() {
  const { user } = useAuth();
  const username = user?.lastfm_username;
  const navigate = useNavigate();
  const { automations, counts, isLoading, error, refetch } =
    useAutomations(username);

  if (!username) {
    return (
      <AccountLinkPrompt message="Link your Last.fm account to view your playlists." />
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <Loader />
      </div>
    );
  }

  const cards = automations.map((auto) => buildCard(auto, counts[auto.id] || 0));

  return (
    <main className="flex-1 overflow-y-auto bg-[#121212] min-h-screen">
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12 md:py-16">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-8"
        >
          <motion.header
            variants={fadeUp}
            className="flex items-center justify-between gap-4"
          >
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                Playlists
              </h1>
              <p className="text-neutral-500 text-sm mt-2">
                Your automated playlist generations
              </p>
            </div>
            <button
              onClick={() => navigate("/playlists/new")}
              className="shrink-0 px-4 py-2 bg-[#ff530b] text-white text-sm rounded-lg hover:bg-[#e04d0a] transition-colors"
            >
              New playlist
            </button>
          </motion.header>

          {error && (
            <motion.div variants={fadeUp}>
              <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4 text-center">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={() => refetch()}
                  className="mt-3 px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-[#ff530b] transition-colors"
                >
                  Retry
                </button>
              </div>
            </motion.div>
          )}

          {!error && automations.length === 0 && (
            <motion.div variants={fadeUp}>
              <div className="rounded-xl border border-neutral-800 bg-[#1a1a1a] p-8 text-center">
                <p className="text-white font-medium mb-2">No playlists yet</p>
                <p className="text-neutral-500 text-sm mb-4">
                  Create your first automated playlist to get started.
                </p>
                <button
                  onClick={() => navigate("/playlists/new")}
                  className="px-4 py-2 bg-[#ff530b] text-white text-sm rounded-lg hover:bg-[#e04d0a] transition-colors"
                >
                  Create a playlist
                </button>
              </div>
            </motion.div>
          )}

          {!error && automations.length > 0 && (
            <motion.div variants={fadeUp}>
              <div className="flex flex-wrap items-start gap-5">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    className="shrink-0 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${card.title} playlist`}
                    onClick={() => navigate(`/playlists/${card.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/playlists/${card.id}`);
                      }
                    }}
                  >
                    <TiltedCard
                      {...CARD_DEFAULTS}
                      imageSrc={card.image}
                      glowColor={card.glowColor}
                      altText={card.title}
                      captionText={card.title}
                      countdownText={card.countdown}
                    />
                  </div>
                ))}

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
            </motion.div>
          )}
        </motion.div>
      </div>
    </main>
  );
}

export default Playlists;
