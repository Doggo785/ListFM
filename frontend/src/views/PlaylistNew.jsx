import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconMusic,
  IconCalendarRepeat,
  IconFilter,
  IconSparkles,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import CronEditor from "@/components/builder/CronEditor";
import { createDefaultAutomation } from "@/lib/automation-rules";
import { StepIndicator } from "@/components/builder/playlist-steps/StepIndicator";
import { StepIdentity } from "@/components/builder/playlist-steps/StepIdentity";
import { StepSource } from "@/components/builder/playlist-steps/StepSource";
import { StepFilters } from "@/components/builder/playlist-steps/StepFilters";
import { StepSummary } from "@/components/builder/playlist-steps/StepSummary";

const STEPS = [
  { id: 1, label: "Identity", icon: IconSparkles },
  { id: 2, label: "Source", icon: IconMusic },
  { id: 3, label: "Schedule", icon: IconCalendarRepeat },
  { id: 4, label: "Filters", icon: IconFilter },
  { id: 5, label: "Summary", icon: IconCheck },
];

export default function PlaylistNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState(createDefaultAutomation());

  useEffect(() => {
    document.title = "New Playlist - ListFM";
  }, []);

  const totalSteps = STEPS.length;

  const canGoNext = () => {
    if (step === 1) return data.name.trim().length > 0;
    return true;
  };

  const handleCreate = () => {
    const existing = JSON.parse(localStorage.getItem("listfm_automations") || "[]");
    const updated = [...existing, data];
    localStorage.setItem("listfm_automations", JSON.stringify(updated));
    navigate("/playlists");
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <StepIdentity data={data} onChange={setData} />;
      case 2:
        return <StepSource data={data} onChange={setData} />;
      case 3:
        return <CronEditor value={data.cron} onChange={(cron) => setData({ ...data, cron })} />;
      case 4:
        return <StepFilters data={data} onChange={setData} />;
      case 5:
        return <StepSummary data={data} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-full min-w-0 flex-1 overflow-y-auto bg-[#121212] p-5 md:p-10">
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <header className="mb-6 shrink-0">
          <button
            type="button"
            onClick={() => navigate("/playlists")}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm mb-4"
          >
            <IconArrowLeft size={16} />
            Back to playlists
          </button>
          <h2 className="text-3xl md:text-4xl font-black text-white">
            <span className="text-[#17AEFF]">New</span> automation
          </h2>
          <p className="mt-1 text-neutral-400 text-sm">
            Create an auto-generated playlist from your Last.fm listening history.
          </p>
        </header>

        <StepIndicator currentStep={step} steps={STEPS} />

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1">{renderStep()}</div>

          <div className="flex items-center justify-between pt-6 pb-4 border-t border-neutral-800 mt-6 shrink-0">
            <Button
              variant="outline"
              size="lg"
              onClick={() => (step > 1 ? setStep(step - 1) : navigate("/playlists"))}
              className="border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              <IconArrowLeft size={16} className="mr-2" />
              {step > 1 ? "Back" : "Cancel"}
            </Button>

            {step < totalSteps ? (
              <Button
                size="lg"
                disabled={!canGoNext()}
                onClick={() => setStep(step + 1)}
                className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <IconArrowRight size={16} className="ml-2" />
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleCreate}
                className="bg-[#ff530b] text-white hover:bg-[#ff530b]/90"
              >
                <IconCheck size={16} className="mr-2" />
                Create automation
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
