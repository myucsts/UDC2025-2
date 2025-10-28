import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SOURCE_URL =
  'https://opendata.pref.saitama.lg.jp/resource_download/7279';
const DEFAULT_ENCODING = 'shift_jis';
const OUTPUT_FILENAME = 'cooling-shelters.csv';

async function fetchCoolingShelters() {
  const sourceUrl =
    process.env.COOLING_SHELTER_SOURCE_URL?.trim() || DEFAULT_SOURCE_URL;
  const sourceEncoding =
    process.env.COOLING_SHELTER_SOURCE_ENCODING?.trim() || DEFAULT_ENCODING;
  const outDir =
    process.env.COOLING_SHELTER_OUTPUT_DIR?.trim() ||
    path.resolve(process.cwd(), 'public', 'data');
  const outPath = path.join(outDir, OUTPUT_FILENAME);

  console.log(`Downloading cooling shelters CSV from ${sourceUrl}`);

  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent':
        'UDC2025-2 Cooling Shelter Fetcher (+https://example.com/support)',
      Accept: 'text/csv,application/octet-stream',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download dataset. HTTP ${response.status} ${response.statusText}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  const { default: iconv } = await import('iconv-lite');
  if (!iconv.encodingExists(sourceEncoding)) {
    throw new Error(
      `Unknown encoding "${sourceEncoding}". Specify a valid iconv-lite encoding name via COOLING_SHELTER_SOURCE_ENCODING.`,
    );
  }

  const decoded = iconv.decode(buffer, sourceEncoding);

  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, decoded, 'utf8');

  console.log(`Saved dataset to ${outPath}`);
}

fetchCoolingShelters().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
