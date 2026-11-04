export function StepIndicator({ currentStep, steps }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isDone = step.id < currentStep;
        return (
          <div key={step.id} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={`w-8 h-px transition-colors ${
                  isDone ? "bg-[var(--ember)]" : "bg-neutral-700"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-[var(--ember)] text-white"
                  : isDone
                    ? "bg-[var(--ember)]/20 text-[var(--ember)]"
                    : "bg-neutral-800 text-neutral-500"
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
