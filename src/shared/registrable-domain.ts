/** Second-level public suffixes we know of, enough to find the registrable domain (eTLD+1). */
const SECOND_LEVEL = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'co.nz',
  'org.nz',
  'net.nz',
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'go.jp',
  'co.kr',
  'or.kr',
  'go.kr',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'edu.cn',
  'com.hk',
  'com.tw',
  'com.sg',
  'com.my',
  'com.ph',
  'com.vn',
  'co.th',
  'co.id',
  'co.in',
  'net.in',
  'org.in',
  'gov.in',
  'ac.in',
  'co.il',
  'org.il',
  'com.sa',
  'com.eg',
  'com.pk',
  'com.tr',
  'com.ua',
  'co.za',
  'org.za',
  'com.ng',
  'com.br',
  'net.br',
  'org.br',
  'gov.br',
  'com.mx',
  'com.ar',
  'com.co',
  'com.pe',
  'com.ve',
  'com.cl',
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * "a.b.example.co.uk" -> "example.co.uk", "www.example.com" -> "example.com".
 * IP addresses, single labels and IPv6 are returned unchanged.
 */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host.includes(':') || IPV4.test(host)) return host;
  const labels = host.split('.');
  const lastTwo = labels.slice(-2).join('.');
  const take = SECOND_LEVEL.has(lastTwo) ? 3 : 2;
  return labels.slice(-take).join('.');
}
