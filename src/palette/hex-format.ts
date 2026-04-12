import { hexToRgba, rgbaToHex, type RGBA } from '../utils/color';

/** Parse a .hex palette file (one hex color per line, no # prefix). */
export function parseHex(text: string): RGBA[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[0-9a-fA-F]{6}$/.test(line))
    .map(hex => hexToRgba(hex));
}

/** Export palette as .hex format string. */
export function exportHex(colors: RGBA[]): string {
  return colors.map(c => rgbaToHex(c)).join('\n') + '\n';
}
