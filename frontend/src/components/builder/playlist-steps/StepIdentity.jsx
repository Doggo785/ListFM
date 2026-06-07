export function StepIdentity({ data, onChange }) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">
          Give your automation a name
        </h3>
        <p className="text-neutral-400 text-sm">
          Choose a clear name so you can easily find this playlist.
        </p>
      </div>

      <div className="space-y-4 max-w-lg mx-auto">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Playlist name
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="e.g. Monthly Discoveries"
            className="w-full rounded-lg border border-neutral-700 bg-[#1c1c1c] px-4 py-3 text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-colors"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">
            Description{" "}
            <span className="text-neutral-500 font-normal">(optional)</span>
          </label>
          <textarea
            value={data.description}
            onChange={(e) =>
              onChange({ ...data, description: e.target.value })
            }
            placeholder="e.g. Compiles my new musical discoveries every month"
            rows={3}
            className="w-full rounded-lg border border-neutral-700 bg-[#1c1c1c] px-4 py-3 text-white placeholder:text-neutral-500 focus:border-[#ff530b] focus:outline-none focus:ring-1 focus:ring-[#ff530b] transition-colors resize-none"
          />
        </div>
      </div>
    </div>
  );
}
