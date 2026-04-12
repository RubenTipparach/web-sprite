export interface PaletteInfo {
  slug: string;
  title: string;
  author: string;
  colorCount: number;
  colors: string[]; // hex strings without #
}

let cachedPalettes: PaletteInfo[] | null = null;

const FALLBACK_PALETTES: PaletteInfo[] = [
  {
    slug: 'sweetie-16', title: 'Sweetie 16', author: 'GrafxKid', colorCount: 16,
    colors: ['1a1c2c','5d275d','b13e53','ef7d57','ffcd75','a7f070','38b764','257179','29366f','3b5dc9','41a6f6','73eff7','f4f4f4','94b0c2','566c86','333c57'],
  },
  {
    slug: 'endesga-32', title: 'ENDESGA 32', author: 'ENDESGA', colorCount: 32,
    colors: ['be4a2f','d77643','ead4aa','e4a672','b86f50','733e39','3e2731','a22633','e43b44','f77622','feae34','fee761','63c74d','3e8948','265c42','193c3e','124e89','0099db','2ce8f5','ffffff','c0cbdc','8b9bb4','5a6988','3a4466','262b44','181425','ff0044','68386c','b55088','f6757a','e8b796','c28569'],
  },
  {
    slug: 'pico-8', title: 'PICO-8', author: 'Lexaloffle', colorCount: 16,
    colors: ['000000','1d2b53','7e2553','008751','ab5236','5f574f','c2c3c7','fff1e8','ff004d','ffa300','ffec27','00e436','29adff','83769c','ff77a8','ffccaa'],
  },
  {
    slug: 'resurrect-64', title: 'Resurrect 64', author: 'Kerrie Lake', colorCount: 64,
    colors: ['2e222f','3e3546','625565','966c6c','ab947a','694f62','7f708a','9babb2','c7dcd0','ffffff','6e2727','b33831','ea4f36','f57d4a','ae2334','e83b3b','fb6b1d','f79617','f9c22b','7a3045','9e4539','cd683d','e6904e','fbb954','4c3e24','676633','a2a947','d5e04b','fbff86','165a4c','239063','1ebc73','91db69','cddf6c','313638','374e4a','547e64','92a984','b2ba90','0b5e65','0b8a8f','0eaf9b','30e1b9','8ff8e2','323353','484a77','4d65b4','4d9be6','8fd3ff','45293f','6b3e75','905ea9','a884f3','eaaded','753c54','a24b6f','cf657f','ed8099','831c5d','c32454','f04f78','f68181','fca790','fdcbb0'],
  },
  {
    slug: 'apollo', title: 'Apollo', author: 'AdamCYounis', colorCount: 16,
    colors: ['172038','253a5e','3c5e8b','4f8fba','73bed3','a4dddb','19332d','25562e','468232','75a743','a8ca58','d0da91','4d2b32','7a4841','ad7757','c09473','d7b594','e7d5b3','341c27','602c2c','884b2b','be772b','de9e41','e8c170','241527','411d31','752438','a53030','cf573c','da863e','1e1d39','402751','7a367b','a23e8c','c65197','df84a5','090a14','10141f','232b35','3a4356','5a6988','8196a7','a8b5b2','c7cfcc','ebede9'],
  },
  {
    slug: 'slso8', title: 'SLSO8', author: 'Luis Miguel Maldonado', colorCount: 8,
    colors: ['0d2b45','203c56','544e68','8d697a','d08159','ffaa5e','ffd4a3','ffecd6'],
  },
  {
    slug: 'ink', title: 'INK', author: 'AprilSundae', colorCount: 5,
    colors: ['1f1f29','413a42','596070','96a2b3','eaf0d8'],
  },
  {
    slug: 'gameboy', title: 'Game Boy', author: 'Nintendo', colorCount: 4,
    colors: ['0f380f','306230','8bac0f','9bbc0f'],
  },
  {
    slug: 'na16', title: 'NA16', author: 'Nauris', colorCount: 16,
    colors: ['8c8fae','584563','3e2137','9a6348','d79b7d','f5edba','c0c741','647d34','e4943a','9d303b','d26471','70377f','7ec4c1','34859d','17434b','1f0e1c'],
  },
  {
    slug: 'oil-6', title: 'Oil 6', author: 'GrafxKid', colorCount: 6,
    colors: ['fbf5ef','f2d3ab','c69fa5','8b6d9c','494d7e','272744'],
  },
  {
    slug: 'twilight-5', title: 'Twilight 5', author: 'Star', colorCount: 5,
    colors: ['fbbbad','ee8695','4a7a96','333f58','292831'],
  },
  {
    slug: 'zughy-32', title: 'Zughy 32', author: 'Zughy', colorCount: 32,
    colors: ['472d3c','5e3643','7a444a','a05b53','bf7958','eea160','f4cca1','b6d53c','71aa34','397b44','3c5956','302c2e','5a5353','7d7071','a0938e','cfc6b8','dff6f5','8aebf1','28ccdf','3978a8','394778','39314b','564064','8e478c','cd6093','ffaeb6','f4b41b','f47e1b','e6482e','a93b3b','827094','4f546b'],
  },
  {
    slug: 'journey', title: 'Journey', author: 'PineTreePizza', colorCount: 16,
    colors: ['050914','110524','3b063a','691749','9b1a49','d44631','ed8d2a','f2c94e','f9f4dc','93dbac','34a46d','0e583d','172e35','253e47','406272','8bb3c8'],
  },
  {
    slug: 'nyx8', title: 'NYX8', author: 'Javier Guerrero', colorCount: 8,
    colors: ['08141e','0f2a3f','20394f','f6d6bd','c3a38a','997577','816271','4e495f'],
  },
  {
    slug: 'fantasy-24', title: 'Fantasy 24', author: 'Gabriel C', colorCount: 24,
    colors: ['1e1a34','52254f','873e5a','cf7a5f','f0ca6c','f8f2b0','6ebe70','2c884d','28596b','3e8bb0','88cfe8','e4f2f1','2d1b2e','574152','887f7a','b4a88e','a4bf8f','7ab176','3f6c47','2c4434','1c2420','222034','45444f','9090a1'],
  },
  {
    slug: 'arq4', title: 'ARQ4', author: 'ENDESGA', colorCount: 4,
    colors: ['ffffff','6772a9','3a3277','000000'],
  },
];

export async function loadBuiltinPalettes(): Promise<PaletteInfo[]> {
  if (cachedPalettes) return cachedPalettes;
  try {
    const base = import.meta.env.BASE_URL ?? '/';
    const resp = await fetch(`${base}palettes/lospec-palettes.json`);
    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      cachedPalettes = data;
      return cachedPalettes;
    }
    throw new Error('Empty palette list');
  } catch {
    // Fallback palette if the build-time fetch hasn't been run
    cachedPalettes = FALLBACK_PALETTES;
    return cachedPalettes;
  }
}
