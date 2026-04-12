/**
 * Build-time script: fetch popular palettes from Lospec and write to public/palettes/.
 * Run with: npm run fetch-palettes
 */

interface LospecPalette {
  slug: string;
  title: string;
  user?: { name: string };
  colors?: string[];
  colorsArray?: string[];
  numberOfColors: number;
}

interface ApiResponse {
  palettes: LospecPalette[];
  totalCount: number;
}

async function fetchPage(page: number): Promise<LospecPalette[]> {
  const url = `https://lospec.com/palette-list/load?page=${page}&sortingType=downloads&colorNumberFilterType=any`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Lospec API error: ${resp.status}`);
  const data: ApiResponse = await resp.json();
  return data.palettes ?? [];
}

async function main() {
  const allPalettes: Array<{
    slug: string;
    title: string;
    author: string;
    colorCount: number;
    colors: string[];
  }> = [];

  // Fetch top 100 palettes (10 pages × 10 per page)
  for (let page = 0; page < 10; page++) {
    try {
      const palettes = await fetchPage(page);
      if (palettes.length === 0) break;

      for (const p of palettes) {
        const colors = p.colorsArray ?? p.colors ?? [];
        allPalettes.push({
          slug: p.slug,
          title: p.title,
          author: p.user?.name ?? 'Unknown',
          colorCount: p.numberOfColors,
          colors: colors.map(c => c.toLowerCase().replace('#', '')),
        });
      }

      console.log(`  Fetched page ${page + 1}: ${palettes.length} palettes`);
    } catch (err) {
      console.warn(`  Failed to fetch page ${page}:`, err);
      break;
    }
  }

  console.log(`\nTotal: ${allPalettes.length} palettes`);

  const { writeFileSync, mkdirSync } = await import('fs');
  const { resolve } = await import('path');

  const outDir = resolve(process.cwd(), 'public/palettes');
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    resolve(outDir, 'lospec-palettes.json'),
    JSON.stringify(allPalettes, null, 2),
  );

  console.log(`Written to public/palettes/lospec-palettes.json`);
}

main().catch(err => {
  console.error('Failed to fetch palettes:', err);
  process.exit(1);
});
