import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const BUILD_INFO_SCHEMA_VERSION = 'acik.platform.web-build-info/v2';

const ROOT_SCRIPT_PATH = /^\/[A-Za-z0-9._/-]+\.(?:js|mjs)$/;

function normalizeRootScriptPath(rawPath) {
  if (
    typeof rawPath !== 'string' ||
    !ROOT_SCRIPT_PATH.test(rawPath) ||
    rawPath.includes('//') ||
    rawPath.includes('\\') ||
    rawPath.includes('%') ||
    rawPath.includes('?') ||
    rawPath.includes('#') ||
    rawPath.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`unsupported root script path in index.html: ${JSON.stringify(rawPath)}`);
  }
  return rawPath;
}

function resolveRootScriptFile(distDir, publicPath) {
  const normalizedDistDir = path.resolve(distDir);
  const candidate = path.resolve(normalizedDistDir, `.${publicPath}`);
  if (!candidate.startsWith(`${normalizedDistDir}${path.sep}`)) {
    throw new Error(`root script escapes dist directory: ${publicPath}`);
  }
  const candidateMetadata = lstatSync(candidate);
  if (candidateMetadata.isSymbolicLink() || !candidateMetadata.isFile()) {
    throw new Error(`root script must be a regular non-symlink file: ${publicPath}`);
  }
  const realDistDir = realpathSync(normalizedDistDir);
  const realCandidate = realpathSync(candidate);
  if (!realCandidate.startsWith(`${realDistDir}${path.sep}`)) {
    throw new Error(`root script resolves outside dist directory: ${publicPath}`);
  }
  return realCandidate;
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Return every external script loaded directly by the assembled shell HTML,
 * in document order. Paths are same-origin absolute public paths and every
 * entry is content-addressed so runtime acceptance can bind browser bytes to
 * the exact bytes served by a Ready pod from the immutable image.
 */
export function collectRootEntrypoints(distDir) {
  const indexHtmlPath = path.join(distDir, 'index.html');
  const html = readFileSync(indexHtmlPath, 'utf8');
  // Commented-out script examples are not runtime dependencies and must not
  // become phantom manifest entries.
  const runtimeHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const scriptSources = [];
  const scriptPattern = /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
  let match;
  while ((match = scriptPattern.exec(runtimeHtml)) !== null) {
    scriptSources.push(normalizeRootScriptPath(match[2]));
  }
  if (scriptSources.length === 0) {
    throw new Error('index.html has no content-addressable root script');
  }

  const seen = new Set();
  return scriptSources.flatMap((publicPath) => {
    if (seen.has(publicPath)) return [];
    seen.add(publicPath);
    const filePath = resolveRootScriptFile(distDir, publicPath);
    return [{ path: publicPath, bodySha256: sha256File(filePath) }];
  });
}
