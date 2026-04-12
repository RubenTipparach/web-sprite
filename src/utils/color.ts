export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRgba(hex: string, a = 255): RGBA {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a,
  };
}

export function rgbaToHex(c: RGBA): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

export function rgbaToCss(c: RGBA): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255})`;
}

export function rgbaEqual(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

export const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };
export const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 255 };
export const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 255 };
