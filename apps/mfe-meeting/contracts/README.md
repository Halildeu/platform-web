# mfe-meeting WS Stream Contract

This folder pins the producer contract for `platform-ai` live-stt `/ws/stream`
server events.

- Source repo: `Halildeu/platform-ai`
- Source path: `docs/contracts/ws-stream-events.schema.json`
- Pinned source commit: `87b3f22022602f9fa853371511e08b0fada82550`

The consumer contract gate compares the local schema to the pinned raw GitHub
schema and validates local valid/invalid fixtures. Breaking producer changes
must bump the schema and receive consumer sign-off before `mfe-meeting` accepts
the new shape.
