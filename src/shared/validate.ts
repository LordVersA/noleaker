const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV6 = /^[0-9a-f:]+$/i;

export function isValidHost(host: string): boolean {
  if (host.includes(':')) return host.length >= 2 && IPV6.test(host);
  return HOSTNAME.test(host);
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Returns an error message, or null if the profile fields are valid. */
export function validateProfile(name: string, host: string, port: number): string | null {
  if (!name.trim()) return 'Name is required.';
  if (!isValidHost(host.trim())) return 'Host must be a hostname or IP address.';
  if (!isValidPort(port)) return 'Port must be between 1 and 65535.';
  return null;
}
