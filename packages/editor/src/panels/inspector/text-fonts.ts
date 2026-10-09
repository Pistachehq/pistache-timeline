/** Free-use families loaded from Google Fonts (SIL Open Font License or Ubuntu font licence). */
export const TEXT_FONT_FAMILIES = [
  'Atkinson Hyperlegible',
  'Ubuntu',
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Oswald',
  'Source Sans 3',
  'Noto Sans',
  'Noto Serif',
  'Merriweather',
  'Playfair Display',
  'Libre Baskerville',
  'Libre Franklin',
  'PT Sans',
  'PT Serif',
  'Nunito',
  'Work Sans',
  'Rubik',
  'Fira Sans',
  'IBM Plex Sans',
  'IBM Plex Mono',
  'JetBrains Mono',
  'Inconsolata',
  'Space Grotesk',
  'DM Sans',
  'Manrope',
  'Outfit',
  'Bebas Neue',
  'Anton',
  'Pacifico',
  'Lobster',
  'Caveat',
  'Permanent Marker',
  'Comfortaa',
  'Raleway',
  'Poppins',
  'Quicksand',
  'Karla',
  'Barlow',
  'Archivo',
  'Crimson Text',
  'Spectral',
  'Bitter',
  'Courier Prime',
  'Special Elite',
  'Press Start 2P',
  'Silkscreen',
] as const;

export type CatalogFontFamily = (typeof TEXT_FONT_FAMILIES)[number];

const loaded = new Set<string>();

export function ensureCatalogFont(family: string): void {
  if (loaded.has(family) || typeof document === 'undefined') return;
  if (!TEXT_FONT_FAMILIES.includes(family as CatalogFontFamily)) return;
  loaded.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@400;700&display=swap`;
  document.head.append(link);
}

const customLoaded = new Set<string>();

export async function ensureCustomFont(family: string, dataUrl: string): Promise<void> {
  const key = `${family}:${dataUrl.slice(0, 64)}`;
  if (customLoaded.has(key) || typeof FontFace === 'undefined') return;
  customLoaded.add(key);
  const face = new FontFace(family, `url(${dataUrl})`);
  const loadedFace = await face.load();
  document.fonts.add(loadedFace);
}
