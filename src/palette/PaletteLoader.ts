export interface PaletteInfo {
  slug: string;
  title: string;
  author: string;
  colorCount: number;
  colors: string[]; // hex strings without #
}

let cachedPalettes: PaletteInfo[] | null = null;

export async function loadBuiltinPalettes(): Promise<PaletteInfo[]> {
  if (cachedPalettes) return cachedPalettes;
  try {
    const base = import.meta.env.BASE_URL ?? '/';
    const resp = await fetch(`${base}palettes/lospec-palettes.json`);
    cachedPalettes = await resp.json();
    return cachedPalettes!;
  } catch {
    // Fallback palette if the build-time fetch hasn't been run
    cachedPalettes = [
      {
        slug: 'sweetie-16',
        title: 'Sweetie 16',
        author: 'GrafxKid',
        colorCount: 16,
        colors: [
          '1a1c2c', '5d275d', 'b13e53', 'ef7d57',
          'ffcd75', 'a7f070', '38b764', '257179',
          '29366f', '3b5dc9', '41a6f6', '73eff7',
          'f4f4f4', '94b0c2', '566c86', '333c57',
        ],
      },
      {
        slug: 'endesga-32',
        title: 'ENDESGA 32',
        author: 'ENDESGA',
        colorCount: 32,
        colors: [
          'be4a2f', 'd77643', 'ead4aa', 'e4a672',
          'b86f50', '733e39', '3e2731', 'a22633',
          'e43b44', 'f77622', 'feae34', 'fee761',
          '63c74d', '3e8948', '265c42', '193c3e',
          '124e89', '0099db', '2ce8f5', 'ffffff',
          'c0cbdc', '8b9bb4', '5a6988', '3a4466',
          '262b44', '181425', 'ff0044', '68386c',
          'b55088', 'f6757a', 'e8b796', 'c28569',
        ],
      },
      {
        slug: 'pico-8',
        title: 'PICO-8',
        author: 'Lexaloffle',
        colorCount: 16,
        colors: [
          '000000', '1d2b53', '7e2553', '008751',
          'ab5236', '5f574f', 'c2c3c7', 'fff1e8',
          'ff004d', 'ffa300', 'ffec27', '00e436',
          '29adff', '83769c', 'ff77a8', 'ffccaa',
        ],
      },
    ];
    return cachedPalettes;
  }
}
