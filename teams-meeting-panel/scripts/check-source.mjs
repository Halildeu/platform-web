// The published panel must identify an immutable source, never an empty build arg.
if (!/^[0-9a-f]{40}$/.test(process.argv[2] ?? '')) {
  console.error('BUILD_SHA must be the full source commit.');
  process.exitCode = 1;
}
