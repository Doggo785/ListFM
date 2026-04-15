// Usage :
// import TiltedCard from './TiltedCard';

{
  /* <TiltedCard
  imageSrc="https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58"
  altText="Kendrick Lamar - GNX Album Cover"
  captionText="Kendrick Lamar - GNX"
  containerHeight="300px"
  containerWidth="300px"
  imageHeight="300px"
  imageWidth="300px"
  rotateAmplitude={6}
  scaleOnHover={1.05}
  showMobileWarning={false}
  showTooltip={false}
  displayOverlayContent
  overlayContent={
    <p className="tilted-card-demo-text">
      Kendrick Lamar - GNX
    </p>
  }
/> */
}

import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 2,
};

export default function TiltedCard({
  imageSrc,
  altText = "Tilted card image",
  captionText = "",
  countdownText = "Next generation in 3 days",
  containerHeight = "300px",
  containerWidth = "100%",
  imageHeight = "300px",
  imageWidth = "300px",
  scaleOnHover = 1.1,
  rotateAmplitude = 14,
  showMobileWarning = true,
  showTooltip = true,
  overlayContent = null,
  displayOverlayContent = false,
}) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);
  const titleX = useSpring(useMotionValue(0), springValues);
  const titleY = useSpring(useMotionValue(0), springValues);
  const subtitleX = useSpring(useMotionValue(0), springValues);
  const subtitleY = useSpring(useMotionValue(0), springValues);
  const opacity = useSpring(0);
  const rotateFigcaption = useSpring(0, {
    stiffness: 350,
    damping: 30,
    mass: 1,
  });

  const [lastY, setLastY] = useState(0);

  function handleMouse(e) {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;

    const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;

    rotateX.set(rotationX);
    rotateY.set(rotationY);

    // Slight text parallax for depth without compromising readability.
    titleX.set(offsetX * 0.03);
    titleY.set(offsetY * 0.03);
    subtitleX.set(offsetX * 0.015);
    subtitleY.set(offsetY * 0.015);

    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);

    const velocityY = offsetY - lastY;
    rotateFigcaption.set(-velocityY * 0.6);
    setLastY(offsetY);
  }

  function handleMouseEnter() {
    scale.set(scaleOnHover);
    opacity.set(1);
  }

  function handleMouseLeave() {
    opacity.set(0);
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
    titleX.set(0);
    titleY.set(0);
    subtitleX.set(0);
    subtitleY.set(0);
    rotateFigcaption.set(0);
  }

  return (
    <figure
      ref={ref}
      className="relative w-full h-full [perspective:800px] flex flex-col items-center justify-center"
      style={{
        height: containerHeight,
        width: containerWidth,
      }}
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {showMobileWarning && (
        <div className="absolute top-4 text-center text-sm block sm:hidden">
          This effect is not optimized for mobile. Check on desktop.
        </div>
      )}

      <motion.div
        className="relative overflow-hidden rounded-[22px] border border-neutral-700/70 bg-gradient-to-b from-[#1d1d1d] to-[#0f0f0f] p-3 shadow-[0_12px_30px_rgba(0,0,0,0.45)] [transform-style:preserve-3d]"
        style={{
          width: imageWidth,
          height: imageHeight,
          rotateX,
          rotateY,
          scale,
        }}
      >
        <div className="flex h-full w-full flex-col gap-3">
          <div className="relative aspect-square w-full overflow-hidden rounded-[15px] bg-neutral-900">
            <motion.img
              src={imageSrc}
              alt={altText}
              className="absolute inset-0 h-full w-full object-cover will-change-transform [transform:translateZ(0)]"
              style={{
                width: "100%",
                height: "100%",
              }}
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
          </div>

          <motion.div
            className="flex flex-1 flex-col justify-between rounded-[15px] border border-neutral-800/80 bg-[#141414] px-4 py-3 [transform:translateZ(30px)]"
            style={{ x: titleX, y: titleY }}
          >
            <div>
              <p className="text-white text-base md:text-lg font-bold leading-tight">
                {captionText}
              </p>
            </div>

            <motion.p
              className="text-neutral-400 text-xs md:text-sm mt-3"
              style={{ x: subtitleX, y: subtitleY }}
            >
              {countdownText}
            </motion.p>
          </motion.div>
        </div>

        {displayOverlayContent && overlayContent && (
          <motion.div className="absolute top-0 left-0 z-[2] will-change-transform [transform:translateZ(30px)]">
            {overlayContent}
          </motion.div>
        )}
      </motion.div>

      {showTooltip && (
        <motion.figcaption
          className="pointer-events-none absolute left-0 top-0 rounded-[4px] bg-white px-[10px] py-[4px] text-[10px] text-[#2d2d2d] opacity-0 z-[3] hidden sm:block"
          style={{
            x,
            y,
            opacity,
            rotate: rotateFigcaption,
          }}
        >
          {captionText}
        </motion.figcaption>
      )}
    </figure>
  );
}
