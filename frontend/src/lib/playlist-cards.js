import { getPlaylistImageSrc, GRADIENTS, hashName } from "@/components/ui/PlaylistLogo";

export const CARD_DEFAULTS = {
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

export function buildAutomationCardBase(auto) {
  const name = auto.name || "Untitled";
  const [color1] = GRADIENTS[hashName(name) % GRADIENTS.length];
  return {
    id: auto.id,
    title: name,
    image: getPlaylistImageSrc(name, auto.source?.type),
    glowColor: `radial-gradient(circle, ${color1}55 0%, transparent 70%)`,
  };
}
