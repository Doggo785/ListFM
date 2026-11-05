const MOSAIC = 4;

/** A playlist's album art: four covers when it has them, or the first alone. Enlarged on purpose, so its pixels show. */
export default function PlaylistCover({ images = [], className, style }) {
  const shown = images.length >= MOSAIC ? images.slice(0, MOSAIC) : images.slice(0, 1);
  return (
    <div
      aria-hidden="true"
      className={`grid aspect-square overflow-hidden bg-(--ember-1) ${shown.length > 1 ? "grid-cols-2 grid-rows-2" : ""} ${className ?? ""}`}
      style={style}
    >
      {shown.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full min-h-0 object-cover [image-rendering:pixelated]"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      ))}
    </div>
  );
}
