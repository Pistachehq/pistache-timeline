export interface LibraryLook {
  readonly filters: readonly string[];
  readonly clipPath?: string;
  readonly transform?: string;
}

const RULES: readonly (readonly [string, LibraryLook])[] = [
  ['auto-levels', { filters: ['contrast(1.7)', 'brightness(1.08)'] }],
  ['auto-color', { filters: ['saturate(1.65)', 'hue-rotate(18deg)'] }],
  ['auto-contrast', { filters: ['contrast(1.85)'] }],
  ['shadow-highlight', { filters: ['brightness(1.2)', 'contrast(0.86)'] }],
  ['brightness-contrast', { filters: ['brightness(1.16)', 'contrast(1.3)'] }],
  ['gaussian-blur', { filters: ['blur(9px)'] }],
  ['camera-lens-blur', { filters: ['blur(7px)', 'brightness(1.06)'] }],
  ['camera-blur', { filters: ['blur(5px)'] }],
  ['directional-blur', { filters: ['blur(6px)'] }],
  ['fast-blur', { filters: ['blur(2.5px)'] }],
  ['channel-blur', { filters: ['blur(4px)', 'saturate(1.5)'] }],
  ['compound-blur', { filters: ['blur(5px)', 'contrast(1.16)'] }],
  ['radial-blur', { filters: ['blur(4px)', 'contrast(1.08)'] }],
  ['box-blur', { filters: ['blur(3px)'] }],
  ['unsharp-mask', { filters: ['contrast(1.48)', 'brightness(1.04)'] }],
  ['vr-sharpen', { filters: ['contrast(1.24)', 'saturate(1.12)'] }],
  ['vr-noise-reduction', { filters: ['blur(1.2px)', 'contrast(1.06)'] }],
  ['vr-blur', { filters: ['blur(6px)'] }],
  ['vr-rotate-sphere', { filters: ['contrast(1.08)'], transform: 'rotate(28deg) scale(0.82)' }],
  ['vr-plane-to-sphere', { filters: ['saturate(1.2)'], transform: 'scale(0.78) rotate(10deg)' }],
  ['vr-projection', { filters: ['contrast(1.12)'], transform: 'scale(1.18)' }],
  ['vr-chromatic', { filters: ['hue-rotate(48deg)', 'saturate(1.55)', 'contrast(1.15)'] }],
  ['vr-digital-glitch', { filters: ['hue-rotate(96deg)', 'contrast(1.55)', 'saturate(1.35)'] }],
  ['vr-fractal', { filters: ['contrast(1.7)', 'hue-rotate(210deg)', 'saturate(1.6)'] }],
  ['vr-gradient', { filters: ['hue-rotate(52deg)', 'saturate(1.45)'] }],
  ['vr-glow', { filters: ['brightness(1.28)', 'saturate(1.35)', 'drop-shadow(0 0 14px white)'] }],
  ['vr-brightness', { filters: ['brightness(1.32)', 'saturate(1.1)'] }],
  ['black-white', { filters: ['grayscale(1)'] }],
  ['color-balance-hls', { filters: ['hue-rotate(26deg)', 'saturate(1.42)'] }],
  ['color-balance', { filters: ['sepia(0.22)', 'saturate(1.36)', 'hue-rotate(8deg)'] }],
  ['color-filter', { filters: ['sepia(0.92)', 'saturate(2)'] }],
  ['color-replace', { filters: ['hue-rotate(154deg)', 'saturate(1.65)'] }],
  ['color-pass', { filters: ['grayscale(1)', 'sepia(1)', 'saturate(4)'] }],
  ['change-to-color', { filters: ['sepia(1)', 'hue-rotate(22deg)', 'saturate(2.6)'] }],
  ['change-color', { filters: ['hue-rotate(58deg)', 'saturate(1.5)'] }],
  ['leave-color', { filters: ['grayscale(0.92)', 'sepia(0.38)'] }],
  ['fast-color-corrector', { filters: ['brightness(1.1)', 'saturate(1.38)'] }],
  ['three-way', { filters: ['sepia(0.28)', 'contrast(1.14)', 'saturate(1.16)', 'hue-rotate(-10deg)'] }],
  ['hue-saturation', { filters: ['hue-rotate(30deg)', 'saturate(1.58)'] }],
  ['rgb-curves', { filters: ['contrast(1.38)', 'saturate(1.08)'] }],
  ['lumetri', { filters: ['contrast(1.18)', 'saturate(1.3)', 'brightness(1.05)', 'hue-rotate(6deg)'] }],
  ['color-stabilizer', { filters: ['saturate(0.82)', 'contrast(1.1)'] }],
  ['video-limiter', { filters: ['contrast(0.76)', 'brightness(0.9)'] }],
  ['green-screen', { filters: ['hue-rotate(95deg)', 'saturate(2)', 'contrast(1.28)'] }],
  ['blue-screen', { filters: ['hue-rotate(205deg)', 'saturate(1.75)', 'contrast(1.22)'] }],
  ['ultra-key', { filters: ['saturate(2.1)', 'contrast(1.58)', 'brightness(1.12)'] }],
  ['chroma-key', { filters: ['saturate(2.3)', 'hue-rotate(125deg)', 'contrast(1.42)'] }],
  ['luma-key', { filters: ['grayscale(0.7)', 'contrast(2.1)'] }],
  ['non-red', { filters: ['hue-rotate(-42deg)', 'saturate(0.42)'] }],
  ['rgb-difference', { filters: ['invert(0.38)', 'hue-rotate(145deg)'] }],
  ['track-matte', { filters: ['contrast(1.32)', 'saturate(0.55)', 'brightness(0.9)'] }],
  ['image-matte', { filters: ['sepia(0.45)', 'contrast(1.22)'] }],
  ['remove-matte', { filters: ['brightness(1.1)', 'contrast(0.94)'] }],
  ['color-key', { filters: ['contrast(1.62)', 'saturate(1.85)', 'hue-rotate(88deg)'] }],
  ['solid-composite', { filters: ['sepia(0.88)', 'saturate(1.9)'] }],
  ['set-matte', { filters: ['contrast(1.52)', 'brightness(0.84)'] }],
  ['calculations', { filters: ['saturate(0.5)', 'contrast(1.45)', 'hue-rotate(200deg)'] }],
  ['arithmetic', { filters: ['invert(0.78)', 'contrast(1.28)'] }],
  ['invert', { filters: ['invert(1)'] }],
  ['extract', { filters: ['grayscale(1)', 'contrast(1.65)'] }],
  ['levels', { filters: ['contrast(1.48)', 'brightness(1.06)'] }],
  ['procamp', { filters: ['brightness(1.12)', 'contrast(1.2)', 'saturate(1.28)'] }],
  ['gamma', { filters: ['brightness(1.24)', 'contrast(0.88)'] }],
  ['tint', { filters: ['sepia(0.78)', 'hue-rotate(328deg)', 'saturate(1.32)'] }],
  ['equalize', { filters: ['contrast(1.68)', 'brightness(1.07)'] }],
  ['glowing-edges', { filters: ['contrast(1.85)', 'brightness(1.22)', 'saturate(1.55)'] }],
  ['find-edges', { filters: ['grayscale(1)', 'contrast(2.5)', 'invert(0.18)'] }],
  ['color-emboss', { filters: ['contrast(1.62)', 'saturate(1.55)', 'brightness(1.1)'] }],
  ['emboss', { filters: ['grayscale(0.85)', 'contrast(1.75)', 'brightness(1.16)'] }],
  ['motion-tile', { filters: ['contrast(1.16)'], transform: 'scale(0.84)' }],
  ['posterize-time', { filters: ['contrast(1.42)', 'saturate(1.12)'] }],
  ['posterize', { filters: ['contrast(1.95)', 'saturate(1.35)'] }],
  ['solarize', { filters: ['invert(0.48)', 'saturate(1.45)'] }],
  ['strobe', { filters: ['contrast(1.55)', 'brightness(1.38)'] }],
  ['replicate', { filters: ['contrast(1.12)'], transform: 'scale(0.9)' }],
  ['brush-strokes', { filters: ['contrast(1.28)', 'saturate(0.75)', 'blur(0.7px)'] }],
  ['threshold', { filters: ['grayscale(1)', 'contrast(3)'] }],
  ['texturize', { filters: ['contrast(1.32)', 'sepia(0.28)'] }],
  ['scatter', { filters: ['contrast(1.22)', 'blur(0.9px)'] }],
  ['alpha-bevel', { filters: ['contrast(1.22)', 'drop-shadow(3px 3px 0 white)'] }],
  ['mosaic', { filters: ['contrast(1.4)', 'saturate(0.72)'] }],
  ['glow', { filters: ['brightness(1.26)', 'saturate(1.42)', 'drop-shadow(0 0 12px white)'] }],
  ['4-color', { filters: ['sepia(0.5)', 'hue-rotate(42deg)', 'saturate(1.85)'] }],
  ['gradient-ramp', { filters: ['hue-rotate(74deg)', 'saturate(1.55)'] }],
  ['circle-grid', { filters: ['contrast(1.28)', 'saturate(1.22)'] }],
  ['checkerboard', { filters: ['contrast(1.85)', 'grayscale(0.35)'] }],
  ['audio-spectrum', { filters: ['saturate(1.65)', 'hue-rotate(262deg)'] }],
  ['audio-waveform', { filters: ['grayscale(0.45)', 'contrast(1.55)'] }],
  ['lens-flare', { filters: ['brightness(1.38)', 'saturate(1.22)', 'contrast(1.06)'] }],
  ['solid-color', { filters: ['sepia(1)', 'saturate(0.15)', 'brightness(0.72)'] }],
  ['gradient', { filters: ['hue-rotate(32deg)', 'saturate(1.42)'] }],
  ['grid', { filters: ['contrast(1.45)'] }],
  ['fill', { filters: ['sepia(0.65)', 'saturate(2.1)', 'brightness(1.08)'] }],
  ['write-on', { filters: ['contrast(1.18)'] }],
  ['stroke', { filters: ['contrast(1.72)', 'brightness(1.12)'] }],
  ['drop-shadow', { filters: ['drop-shadow(12px 14px 10px rgba(0,0,0,0.8))'] }],
  ['bevel-edges', { filters: ['contrast(1.48)', 'drop-shadow(0 0 3px white)'] }],
  ['bevel-alpha', { filters: ['contrast(1.32)', 'brightness(1.08)'] }],
  ['basic-3d', { filters: ['contrast(1.1)'], transform: 'rotate(9deg) scale(0.9)' }],
  ['horizontal-flip', { filters: [], transform: 'scaleX(-1)' }],
  ['vertical-flip', { filters: [], transform: 'scaleY(-1)' }],
  ['horizontal-offset', { filters: [], transform: 'translateX(14%)' }],
  ['vertical-offset', { filters: [], transform: 'translateY(14%)' }],
  ['spherize', { filters: ['contrast(1.08)'], transform: 'scale(1.14)' }],
  ['mirror', { filters: [], transform: 'scaleX(-1)' }],
  ['twirl', { filters: [], transform: 'rotate(24deg) scale(0.88)' }],
  ['corner-pin', { filters: [], transform: 'rotate(8deg) skewX(9deg)' }],
  ['mesh-warp', { filters: [], transform: 'skewX(12deg) scale(1.06)' }],
  ['rolling-shutter', { filters: [], transform: 'skewY(8deg)' }],
  ['warp-stabilizer', { filters: ['contrast(1.06)'], transform: 'scale(1.03)' }],
  ['optics', { filters: ['contrast(1.12)'], transform: 'scale(1.05)' }],
  ['ripple', { filters: ['blur(1.2px)', 'contrast(1.24)'] }],
  ['wave', { filters: [], transform: 'rotate(5deg) scale(1.04, 0.96)' }],
  ['displacement', { filters: ['hue-rotate(16deg)', 'contrast(1.22)'], transform: 'translate(6%, -4%)' }],
  ['offset', { filters: [], transform: 'translate(8%, 6%)' }],
  ['transform', { filters: ['contrast(1.08)'], transform: 'rotate(4deg) scale(1.06)' }],
  ['dust-scratches', { filters: ['contrast(1.38)', 'grayscale(0.2)'] }],
  ['remove-grain', { filters: ['blur(0.9px)', 'contrast(1.06)'] }],
  ['auto-hls', { filters: ['hue-rotate(-12deg)', 'saturate(1.18)'] }],
  ['hls-noise', { filters: ['hue-rotate(14deg)', 'saturate(1.22)', 'contrast(1.16)'] }],
  ['alpha-noise', { filters: ['contrast(1.18)', 'brightness(1.1)'] }],
  ['noise', { filters: ['contrast(1.28)', 'saturate(0.82)'] }],
  ['median', { filters: ['blur(1px)', 'contrast(1.14)'] }],
  ['pixel-motion', { filters: ['blur(3.5px)'] }],
  ['echo', { filters: ['brightness(1.08)', 'contrast(0.92)', 'blur(1px)'] }],
  ['cineon', { filters: ['contrast(1.22)', 'sepia(0.18)'] }],
  ['hdr', { filters: ['brightness(1.2)', 'saturate(1.18)'] }],
  ['sdr', { filters: ['contrast(0.88)', 'saturate(0.88)'] }],
  ['timecode', { filters: ['contrast(1.12)', 'brightness(1.04)'] }],
  ['metadata', { filters: ['brightness(1.06)', 'saturate(0.95)'] }],
  ['clip-name', { filters: ['contrast(1.08)'] }],
  ['legacy-title', { filters: ['sepia(0.35)', 'contrast(1.12)'] }],
  ['rgb-color', { filters: ['hue-rotate(205deg)', 'saturate(1.65)'] }],
  ['sharpen', { filters: ['contrast(1.3)'] }],
  ['crop', { filters: [], clipPath: 'inset(8% 8% 8% 8%)' }],
  ['linear-wipe', { filters: [], clipPath: 'inset(0 42% 0 0)' }],
  ['radial-wipe', { filters: [], clipPath: 'circle(38% at 50% 50%)' }],
  ['gradient-wipe', { filters: ['hue-rotate(20deg)'], clipPath: 'inset(0 35% 0 0)' }],
  ['venetian', { filters: [], clipPath: 'inset(18% 0 18% 0)' }],
  ['block-dissolve', { filters: ['contrast(1.35)'], clipPath: 'inset(12%)' }],
];

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) % 360;
  return h;
}

/** Scales mask percentages and pixel radii with the inspector Amount control. */
export function scaleLibraryClipPath(clipPath: string, amount: number): string {
  const t = Math.min(2, Math.max(0, amount) / 100);
  return clipPath.replace(/(-?[\d.]+)(%|px)/g, (_full, num: string, unit: string) => {
    const n = Number(num);
    if (!Number.isFinite(n)) return _full;
    return `${Math.round(n * t * 10) / 10}${unit}`;
  });
}

/** Scales a preset look so the inspector Amount control changes the picture. 100 is the preset. */
export function applyLibraryAmount(filters: readonly string[], amount: number): string[] {
  const t = Math.min(2, Math.max(0, amount) / 100);
  return filters.map((filter) => scaleCssFunction(filter, t));
}

function scaleCssFunction(filter: string, t: number): string {
  return filter.replace(/([a-z-]+)\(([^)]+)\)/gi, (full, fn: string, arg: string) => {
    const match = /^(-?[\d.]+)(.*)$/.exec(arg.trim());
    if (!match?.[1]) return full;
    const n = Number(match[1]);
    const suffix = match[2] ?? '';
    const name = fn.toLowerCase();
    let next = n;
    if (name === 'blur' || name === 'hue-rotate' || name === 'grayscale' || name === 'sepia' || name === 'invert') {
      next = n * t;
    } else if (name === 'brightness' || name === 'contrast' || name === 'saturate') {
      next = 1 + (n - 1) * t;
    } else {
      return t > 0.02 ? full : `${name}(0${suffix})`;
    }
    return `${fn}(${Math.round(next * 1000) / 1000}${suffix})`;
  });
}

/** Visible treatment for a catalog video effect that is not a built-in kind. */
export function libraryEffectLook(libraryId: string): LibraryLook {
  const id = libraryId.toLowerCase();
  const ordered = [...RULES].sort((a, b) => b[0].length - a[0].length);
  for (const [key, look] of ordered) {
    if (id.includes(key)) return look;
  }
  return { filters: [`hue-rotate(${hashHue(libraryId)}deg)`, 'saturate(1.4)', 'contrast(1.18)'] };
}
