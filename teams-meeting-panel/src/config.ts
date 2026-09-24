export const BASE = '/teams/panel/';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PanelConfig = { keycloak: { url: string; realm: string; clientId: string } };
export const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function parseConfig(value: unknown): PanelConfig {
  if (!isRecord(value) || !isRecord(value.keycloak)) throw new Error('panel_not_configured');
  const { url, realm, clientId } = value.keycloak;
  if (typeof url !== 'string' || typeof realm !== 'string' || typeof clientId !== 'string'
    || !/^[a-zA-Z0-9._-]{1,100}$/.test(realm) || !/^[a-zA-Z0-9._-]{1,100}$/.test(clientId))
    throw new Error('panel_not_configured');
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash)
    throw new Error('panel_not_configured');
  return { keycloak: { url: target.href.replace(/\/$/, ''), realm, clientId } };
}

export async function loadConfig(): Promise<PanelConfig> {
  const response = await fetch(`${BASE}config.json`, { credentials: 'omit', redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw new Error('panel_not_configured');
  return parseConfig(await response.json());
}

export function selectedMeeting(search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get('meetingId');
  return params.getAll('meetingId').length === 1 && id && UUID.test(id) ? id : null;
}
