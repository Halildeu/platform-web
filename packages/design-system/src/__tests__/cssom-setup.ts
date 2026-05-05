/**
 * Vitest browser provider setup for CSSOM tests.
 *
 * Loads Tailwind 4 + the repo's generated theme CSS so that resolved CSS
 * variables and utility classes are available in the test page. Without
 * this import, Chromium would render the test root with no stylesheet
 * applied and `getComputedStyle` would still return empty strings — the
 * exact failure mode this whole boundary exists to prevent.
 *
 * The CSS entry mirrors `apps/mfe-shell/src/index.css`. If that entry
 * changes (new @source globs, new @import lines), the canary CSSOM
 * sentinel test will fail and force this file to be updated alongside
 * the shell entry.
 */

import './cssom-harness.css';
