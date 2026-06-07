const SAMPLE_SIZE = 10;
const DEFAULT_COLORS = ['#ff530b', '#c084fc', '#17AEFF'];

export function extractColors(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = Math.min(img.width, img.height, 50);
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        const colorMap = {};
        for (let i = 0; i < data.length; i += 16) {
          const r = Math.round(data[i] / 32) * 32;
          const g = Math.round(data[i + 1] / 32) * 32;
          const b = Math.round(data[i + 2] / 32) * 32;
          const key = `${r},${g},${b}`;
          colorMap[key] = (colorMap[key] || 0) + 1;
        }

        const sorted = Object.entries(colorMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, SAMPLE_SIZE)
          .map(([key]) => {
            const [r, g, b] = key.split(',').map(Number);
            return `rgb(${r}, ${g}, ${b})`;
          });

        if (sorted.length >= 3) {
          resolve(sorted);
        } else {
          resolve(DEFAULT_COLORS);
        }
      } catch {
        resolve(DEFAULT_COLORS);
      }
    };
    img.onerror = () => resolve(DEFAULT_COLORS);
    img.src = imageSrc;
  });
}

export function pickRingColors(palette) {
  if (!palette || palette.length < 3) return DEFAULT_COLORS;

  const hsl = palette.map((c) => {
    const match = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) return { h: 0, s: 0, l: 0 };
    const r = match[1] / 255;
    const g = match[2] / 255;
    const b = match[3] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s, l };
  });

  hsl.sort((a, b) => b.s - a.s);

  const vibrant = hsl.slice(0, 3);
  vibrant.sort((a, b) => a.h - b.h);

  return vibrant.map(
    (c) => `hsl(${Math.round(c.h)}, ${Math.round(c.s * 100)}%, ${Math.round(c.l * 100)}%)`
  );
}
