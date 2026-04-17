import { useState } from "react";
import TiltedCard from "../components/ui/PlaylistCard";

const INITIAL_AUTOMATIONS = [
  {
    id: "auto-1",
    title: "Weekly Discovery Sync",
    image: "https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58",
    description: "Saves your weekly discovery radar every Monday.",
  },
];

export default function Playlist() {
  const [automations] = useState(INITIAL_AUTOMATIONS);

  return (
    <div className="h-screen w-full min-w-0 flex-1 overflow-y-auto bg-[#121212] p-5 md:p-10">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <header className="mb-8">
          <h2 className="text-4xl font-black text-white">
            <span className="text-[#17AEFF]">Automated</span> Playlists
          </h2>
          <p className="mt-2 text-neutral-400">
            Menu des playlists automatisees.
          </p>
        </header>

        <section className="min-h-[calc(100vh-240px)] rounded-3xl border border-neutral-800 bg-[#171717] p-5 md:p-7">
          <div className="h-full overflow-visible py-3">
            <h3 className="mb-6 text-lg font-bold text-white">
              Mes automatisations
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
                  />
                </div>
              ))}
              <div className="w-2 shrink-0 md:w-4" aria-hidden="true" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
