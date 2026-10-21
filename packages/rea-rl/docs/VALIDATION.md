# Validation record

Locally exercised on Windows with Node 24.19.0, using pinned published REA 6.7.0. This records checked behavior, not a performance or provider conformance certification.

- Product TypeScript check and bundle: passed.
- Six product tests: passed. The stdio integration uses a real MCP client and the published REA subprocess, discovers schemas, inspects the actual Node executable, retrieves its observed format, credits a fixed predicate, requests a PNG, exports OKF/policy, and generates a frontend from a labeled synthetic page fixture. Existing output directories are rejected.
- Eleven source lab/frontend tests: passed, including real local Edge observation, desktop/mobile preview and control interaction, and REA PNG comparison. The browser target is a local fixture, not an independently replicated customer application.
- Four optional Gymnasium environment tests: passed.
- Tarball installed into a separate local directory: passed. Its doctor discovers 207 upstream tools. The real stdio integration also passes against this installed built executable, including frontend generation.
- `git diff --check`: passed.

## Native provider verification (0.1.1)

Ghidra 12.1.4 and Eclipse Temurin JDK 21.0.12.1 were installed locally from their official release archives with SHA-256 checks. The Codex registration passes their installation paths to REA RL, which forwards them to the real REA process.

The opt-in native integration check passed against the installed MCP package: `binary_session` reported Ghidra available, `open_binary` selected Ghidra for the JDK's native Windows `jabswitch.exe`, `list_procedures` returned 228 procedures, and `analyze_function` returned nonempty C-like pseudocode and assembly for the selected entry at `0x140003190`. `close_binary` completed successfully. The target was statically analyzed without execution. This establishes a real native decompilation path; it does not establish whole-program source recovery or behavioral equivalence.

Run the same check with `GHIDRA_INSTALL_DIR`, `JAVA_HOME`, and `REA_RL_NATIVE_TARGET` set to approved local paths, using `node --import tsx --test test/native.test.ts` inside the product package. Set `REA_RL_TEST_BIN` to the installed executable to check that installation. Without an explicit target, this test is skipped.

The selected real analysis result was 5,541 serialized wire bytes; the compact MCP reply was 2,289 bytes. This is one byte comparison, not measured tokens or a representative task benchmark. Token usage, peak memory, cold/warm performance and generalization remain unmeasured.

GitHub's product checks passed on Ubuntu and Windows for version 0.1.1. Ghidra was exercised locally on Windows as described above. GitHub Release publication, direct Claude Code/Codex model-driven interaction, and other external providers remain unverified. No claim is made that all 207 upstream tools or providers have been exercised.
