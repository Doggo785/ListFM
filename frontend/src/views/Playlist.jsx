import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TiltedCard from "../components/ui/PlaylistCard";
import {
  SOURCE_TYPE_LABELS,
  RECURRENCE_UNIT_LABELS,
  PERIOD_OPTIONS,
} from "@/lib/automation-rules";
import { getPlaylistImageSrc, GRADIENTS, hashName } from "@/components/ui/PlaylistLogo";
import { IconPlus } from "@tabler/icons-react";

function buildDescription(auto) {
  const source = SOURCE_TYPE_LABELS[auto.source?.type] || auto.source?.type;
  const period =
    PERIOD_OPTIONS.find((p) => p.value === auto.source?.period)?.label ||
    auto.source?.period;

  if (auto.recurrence?.enabled) {
    const unit = RECURRENCE_UNIT_LABELS[auto.recurrence.unit] || auto.recurrence.unit;
    return `Every ${auto.recurrence.interval} ${unit} · ${source} · ${period}`;
  }
  return `${source} · ${period}`;
}

export default function Playlist() {
  const [automations, setAutomations] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("listfm_automations") || "[]");
    const userCards = saved.map((auto) => {
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
    setAutomations(userCards);
  }, []);

  return (
    <div className="h-screen w-full min-w-0 flex-1 overflow-y-auto bg-[#121212] p-5 md:p-10">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <header className="mb-8">
          <h2 className="text-4xl font-black text-white">
            <span className="text-[#17AEFF]">Automated</span> Playlists
          </h2>
          <p className="mt-2 text-neutral-400">
            Manage your automated playlists.
          </p>
        </header>

        <section className="rounded-3xl border border-neutral-800 bg-[#171717] p-5 md:p-7">
          <div className="py-3">
            <h3 className="mb-6 text-lg font-bold text-white">
              My automations
            </h3>

            <div className="flex flex-wrap items-start gap-6 pb-8 pt-2">
              {automations.map((auto) => {
                const isUserAutomation = !auto.id.startsWith("auto-");
                return (
                  <div
                    key={auto.id}
                    className={`group relative shrink-0 py-2 ${
                      isUserAutomation
                        ? "cursor-pointer"
                        : ""
                    }`}
                    onClick={
                      isUserAutomation
                        ? () => navigate(`/playlists/${auto.id}`)
                        : undefined
                    }
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
                      imageSrc={auto.image}
                      glowColor={auto.glowColor}
                      altText={auto.title}
                      captionText={auto.title}
                      countdownText={auto.description}
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
                );
              })}
              <button
                type="button"
                onClick={() => navigate("/playlists/new")}
                className="shrink-0 rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17AEFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
                aria-label="Create a new automated playlist"
              >
                <TiltedCard
                  icon={IconPlus}
                  altText="+"
                  captionText="New automated playlist"
                  countdownText=""
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
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
