/** Persian and Arabic-script font families that can reveal an Iranian system. */
export const PERSIAN_FONTS = [
  'IRANSans',
  'IRANSansX',
  'IRANSansWeb',
  'IRAN Sans',
  'IRANYekan',
  'IRANYekanX',
  'Iranian Sans',
  'Vazir',
  'Vazirmatn',
  'Vazir Code',
  'Sahel',
  'Samim',
  'Shabnam',
  'Estedad',
  'Dana',
  'DanaFaNum',
  'Yekan',
  'YekanBakh',
  'Parastoo',
  'Gandom',
  'Tanha',
  'Nahid',
  'Mikhak',
  'Ravi',
  'Behdad',
  'B Nazanin',
  'B Titr',
  'B Yekan',
  'B Mitra',
  'B Lotus',
  'B Koodak',
  'B Zar',
  'Nazanin',
  'Titr',
  'Mitra',
  'Lotus',
  'Zar',
  'Traffic',
  'Homa',
  'Koodak',
  'Far Nazanin',
  'Persian Sans',
  'Noto Naskh Arabic',
  'Noto Nastaliq Urdu',
  'W_nazanin',
  'XB Zar',
  'XB Niloofar',
] as const;

/** Lowercase, no quotes, no spaces / underscores / hyphens: "B-Nazanin", "b nazanin" -> "bnazanin". */
export function normalizeFamily(name: string): string {
  return name
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[\s_-]+/g, '');
}

const SET = new Set(PERSIAN_FONTS.map(normalizeFamily));

export function isPersianFont(name: string): boolean {
  return SET.has(normalizeFamily(name));
}
