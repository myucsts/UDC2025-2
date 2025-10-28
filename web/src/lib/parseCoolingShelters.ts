import Papa from 'papaparse';
import type { ParseError } from 'papaparse';
import type { CoolingShelter, DailyWindow } from '../types';

const DAY_CONFIG = [
  { key: 'sun', label: '日', matchers: ['日曜', '日曜日', 'Sun', 'SUN'] },
  { key: 'mon', label: '月', matchers: ['月曜', '月曜日', 'Mon', 'MON'] },
  { key: 'tue', label: '火', matchers: ['火曜', '火曜日', 'Tue', 'TUE'] },
  { key: 'wed', label: '水', matchers: ['水曜', '水曜日', 'Wed', 'WED'] },
  { key: 'thu', label: '木', matchers: ['木曜', '木曜日', 'Thu', 'THU'] },
  { key: 'fri', label: '金', matchers: ['金曜', '金曜日', 'Fri', 'FRI'] },
  { key: 'sat', label: '土', matchers: ['土曜', '土曜日', 'Sat', 'SAT'] },
];

const NIL_VALUES = new Set(['', '―', 'ｰ', '-', 'ー', '―', '－', '無し', 'なし']);

const toHalfWidth = (value: string): string =>
  value.replace(/[\uFF01-\uFF5E]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );

const normalizeKey = (key: string): string =>
  toHalfWidth(key)
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, (char) => (char === '（' ? '(' : ')'))
    .replace(/・/g, '')
    .replace(/　/g, '')
    .replace(/：/g, ':');

const cleanValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (NIL_VALUES.has(trimmed)) {
    return undefined;
  }
  return trimmed;
};

const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const sanitized = value.replace(/[^\d.+-]/g, '');
  if (!sanitized) return undefined;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeTime = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const match = value.match(/(\d{1,2})(?::|：)?(\d{2})?/);
  if (!match) return undefined;
  const hour = match[1].padStart(2, '0');
  const minute = match[2] ?? '00';
  return `${hour}:${minute}`;
};

const keyHasAll = (key: string, ...needles: string[]) =>
  needles.every((needle) => key.includes(needle));

const findByMatchers = (
  keys: string[],
  matchers: string[],
  needle: string,
): string | undefined =>
  keys.find((key) =>
    matchers.some(
      (matcher) =>
        keyHasAll(key, matcher) &&
        (needle === 'start'
          ? key.includes('開始') || key.toLowerCase().includes('start')
          : key.includes('終了') || key.includes('閉') || key.toLowerCase().includes('end')),
    ),
  );

const pickFirst = (
  row: Record<string, string | undefined>,
  candidates: string[],
): string | undefined => {
  for (const candidate of candidates) {
    const normalized = normalizeKey(candidate);
    if (row[normalized]) {
      return row[normalized];
    }
  }
  return undefined;
};

export async function parseCoolingShelterCsv(
  csvText: string,
): Promise<CoolingShelter[]> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
  });

  if (parsed.errors.length > 0) {
    const message = parsed.errors
      .map((err: ParseError) => `${err.type}: ${err.message}`)
      .join('; ');
    console.warn('CSV parse warnings:', message);
  }

  const shelters: CoolingShelter[] = [];

  for (const rawRow of parsed.data) {
    if (!rawRow) continue;

    const normalizedEntries: Array<[string, string | undefined]> = Object.entries(
      rawRow,
    ).map(([rawKey, rawValue]) => [
      normalizeKey(rawKey),
      cleanValue(rawValue),
    ]);
    const row = Object.fromEntries(normalizedEntries);
    if (Object.keys(row).length === 0) continue;

    const id = pickFirst(row, ['ID', 'ＩＤ', 'Id']);
    const municipalityName =
      pickFirst(row, [
        '地方公共団体名',
        '市区町村名',
        '地方自治体名',
        '自治体名',
      ]) ?? '';
    const name =
      pickFirst(row, [
        '指定暑熱避難施設の名称',
        '施設名',
        '名称',
        '避難施設名',
      ]) ?? '';
    const address =
      pickFirst(row, [
        '所在地',
        '住所',
        '所在地住所',
        '所在地等',
      ]) ?? '';

    const latitude = parseNumber(pickFirst(row, ['緯度', 'Latitude']));
    const longitude = parseNumber(pickFirst(row, ['経度', 'Longitude']));

    if (!id || !name || latitude === undefined || longitude === undefined) {
      continue;
    }

    const municipalityCode = pickFirst(row, [
      '市区町村コード',
      '自治体コード',
      '地方公共団体コード',
      '全国地方公共団体コード',
    ]);

    const specialNotes = pickFirst(row, [
      '指定暑熱避難施設を開放することができる日及び時間帯特記事項',
      '特記事項',
      '開放特記事項',
    ]);

    const capacity = parseNumber(
      pickFirst(row, [
        '指定暑熱避難施設の開放により受け入れることが可能であると見込まれる人数',
        '受入可能人数',
        '収容可能人数',
      ]),
    );

    const manager = pickFirst(row, [
      '施設管理者名',
      '管理者名',
      '管理者',
    ]);
    const email = pickFirst(row, [
      '連絡先メールアドレス',
      'メールアドレス',
      '連絡先Mail',
    ]);
    const phone = pickFirst(row, [
      '電話番号',
      '連絡先電話番号',
      'TEL',
    ]);
    const url = pickFirst(row, ['URL', 'ＵＲＬ', 'ホームページ']);
    const designationDate = pickFirst(row, ['指定日', '指定年月日']);

    const facilityOwnership = pickFirst(row, [
      '公共施設',
      '施設区分',
      '施設分類',
    ]);
    const facilityTypeCategory = pickFirst(row, [
      '施設の種類',
      '施設の種類　',
      '施設種類',
      '施設分類詳細',
    ]);

    const keys = Object.keys(row);
    const openings: DailyWindow[] = DAY_CONFIG.map((day) => {
      const startKey = findByMatchers(keys, day.matchers, 'start');
      const endKey = findByMatchers(keys, day.matchers, 'end');
      return {
        dayLabel: day.label,
        open: normalizeTime(startKey ? row[startKey] : undefined),
        close: normalizeTime(endKey ? row[endKey] : undefined),
      };
    });

    shelters.push({
      id,
      municipalityCode,
      municipalityName: municipalityName || '埼玉県',
      name,
      address,
      latitude,
      longitude,
      openings,
      specialNotes,
      capacity: capacity ?? null,
      manager,
      email,
      phone,
      url,
      designationDate,
      facilityTypeCategory,
      facilityOwnership,
    });
  }

  return shelters;
}
