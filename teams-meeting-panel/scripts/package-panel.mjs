import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const versionParts = value => typeof value === 'string' && /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/.test(value) ? value.split('.').map(Number) : null;

/** Extend the approved bot package rather than invent another bot identity. */
export function withPanel(original, publicOrigin, version) {
  const url = new URL(publicOrigin);
  const next = versionParts(version); const prior = versionParts(original?.version);
  const newer = next && prior && next.some((value, i) => value > prior[i] && next.slice(0, i).every((part, j) => part === prior[j]));
  if (url.protocol !== 'https:' || url.origin !== publicOrigin || !url.hostname.includes('.')
    || url.hostname.endsWith('.invalid') || url.port || url.username || url.password || !newer)
    throw new Error('Invalid public origin or package version');
  if (!uuid.test(original?.id ?? '') || original.id === '00000000-0000-0000-0000-000000000000'
    || original.manifestVersion !== '1.19' || original.icons?.color !== 'color.png' || original.icons?.outline !== 'outline.png'
    || !Array.isArray(original.bots) || original.bots.length !== 1 || !uuid.test(original.bots[0].botId ?? '')
    || original.bots[0].botId === '00000000-0000-0000-0000-000000000000' || original.bots[0].supportsCalling !== true
    || !Array.isArray(original.validDomains) || !original.validDomains.includes(url.hostname)
    || (original.configurableTabs?.length ?? 0) !== 0 || JSON.stringify(original).includes('{{'))
    throw new Error('Use the approved backend-generated bot package');
  return { ...original, version, configurableTabs: [{
    configurationUrl: `${url.origin}/teams/panel/index.html?configure=1`, canUpdateConfiguration: true,
    scopes: ['groupchat', 'team'], context: ['meetingSidePanel', 'meetingChatTab', 'meetingDetailsTab'],
  }] };
}

export function writePackage(inputDirectory, outputDirectory, publicOrigin, version) {
  const original = JSON.parse(readFileSync(resolve(inputDirectory, 'manifest.json'), 'utf8'));
  const files = new Map([
    ['manifest.json', Buffer.from(JSON.stringify(withPanel(original, publicOrigin, version), null, 2) + '\n')],
    ['color.png', readFileSync(resolve(inputDirectory, 'color.png'))],
    ['outline.png', readFileSync(resolve(inputDirectory, 'outline.png'))],
  ]);
  mkdirSync(outputDirectory); // Existing packages are never overwritten.
  for (const [name, bytes] of files) writeFileSync(resolve(outputDirectory, name), bytes, { flag: 'wx' });
  return [...files].map(([name, bytes]) => `${createHash('sha256').update(bytes).digest('hex')}  ${name}`).join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 6) throw new Error('Arguments required');
    console.log(writePackage(resolve(process.argv[2]), resolve(process.argv[3]), process.argv[4], process.argv[5]));
    console.log('Files prepared. Teams schema validation, tenant installation and real meeting acceptance remain required.');
  } catch {
    console.error('Package not completed. Supply an approved bot directory, new output directory, approved HTTPS origin and higher package version.');
    process.exitCode = 1;
  }
}
