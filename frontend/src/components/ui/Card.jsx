import React from "react";

export const Card = ({ children, className = "", neonColor = "cyan" }) => {
  const neonColors = {
    cyan: "border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)] hover:shadow-[0_0_20px_rgba(34,211,238,0.7)]",
    pink: "border-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)] hover:shadow-[0_0_20px_rgba(236,72,153,0.7)]",
    purple:
      "border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] hover:shadow-[0_0_20px_rgba(168,85,247,0.7)]",
    green:
      "border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] hover:shadow-[0_0_20px_rgba(34,197,94,0.7)]",
    orange:
      "border-orange-500 shadow-[0_0_10px_rgba(255,104,23,0.5)] hover:shadow-[0_0_20px_rgba(255,104,23,0.7)]",
  };

  return (
    <div
      className={`
            relative border rounded-lg backdrop-blur-sm bg-black/50
            transition-all duration-300
            ${neonColors[neonColor]} ${className}
        `}
    >
      <div className="p-6">{children}</div>
    </div>
  );
};

export default Card;
