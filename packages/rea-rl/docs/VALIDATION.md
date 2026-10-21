# Validation record

Locally exercised on Windows with Node 24.19.0, using pinned published REA 6.7.0. This records checked behavior, not a performance or provider conformance certification.

- Product TypeScript check and bundle: passed.
- Six product tests: passed. The stdio integration uses a real MCP client and the published REA subprocess, discovers schemas, inspects the actual Node executable, retrieves its observed format, credits a fixed predicate, requests a PNG, exports OKF/policy, and generates a frontend from a labeled synthetic page fixture. Existing output directories are rejected.
- Eleven source lab/frontend tests: passed, including real local Edge observation, desktop/mobile preview and control interaction, and REA PNG comparison. The browser target is a local fixture, not an independently replicated customer application.
- Four optional Gymnasium environment tests: passed.
- Tarball installed into a separate local directory: passed. Its doctor discovers 207 upstream tools. The real stdio integration also passes against this installed built executable, including frontend generation.
- `git diff --check`: passed.

The selected real analysis result was 5,541 serialized wire bytes; the compact MCP reply was 2,289 bytes. This is one byte comparison, not measured tokens or a representative task benchmark. Token usage, peak memory, cold/warm performance and generalization remain unmeasured.

Linux CI, GitHub Release publication, actual Claude Code/Codex client interaction, and optional external providers have not been run locally. The release workflow schedules Ubuntu and Windows product checks when pushed. No claim is made that all 207 upstream tools or providers have been exercised.
