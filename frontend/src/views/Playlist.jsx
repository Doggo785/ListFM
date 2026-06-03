import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TiltedCard from "../components/ui/PlaylistCard";
import AddImage from "@/assets/add.png";
import {
  SOURCE_TYPE_LABELS,
  RECURRENCE_UNIT_LABELS,
  PERIOD_OPTIONS,
} from "@/lib/automation-rules";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23374151'/%3E%3Cstop offset='100%25' stop-color='%23111827'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' fill='url(%23g)'/%3E%3Ctext x='150' y='160' text-anchor='middle' font-family='system-ui' font-size='64' font-weight='bold' fill='%236b7280'%3E%25%3C/text%3E%3C/svg%3E";

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

function getInitial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

const INITIAL_AUTOMATIONS = [
  {
    id: "auto-1",
    title: "Weekly Discovery Sync",
    image: "https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58",
    description: "Saves your weekly discovery radar every Monday.",
  },
];

export default function Playlist() {
  const [automations, setAutomations] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("listfm_automations") || "[]");
    const userCards = saved.map((auto) => ({
      id: auto.id,
      title: auto.name || "Untitled",
      image: PLACEHOLDER_IMAGE,
      description: buildDescription(auto),
    }));
    setAutomations([...INITIAL_AUTOMATIONS, ...userCards]);
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

        <section className="min-h-[calc(100vh-240px)] rounded-3xl border border-neutral-800 bg-[#171717] p-5 md:p-7">
          <div className="h-full overflow-visible py-3">
            <h3 className="mb-6 text-lg font-bold text-white">
              My automations
            </h3>

            <div className="flex h-full items-center gap-6 overflow-x-auto overflow-y-visible pb-8 pt-2">
              <div className="w-2 shrink-0 md:w-4" aria-hidden="true" />
              {automations.map((auto) => (
                <div key={auto.id} className="group relative shrink-0 py-2">
                  <TiltedCard
                    imageSrc={auto.image}
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
                    overlayContent={
                      auto.initial ? (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="text-7xl font-black text-white/20">
                            {auto.initial}
                          </span>
                        </div>
                      ) : null
                    }
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
                  imageSrc={AddImage}
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
              <div className="w-2 shrink-0 md:w-4" aria-hidden="true" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
