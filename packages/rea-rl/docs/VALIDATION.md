# Validation record

Locally exercised on Windows with Node 24.19.0, using pinned published REA 6.7.0. This records checked behavior, not a performance or provider conformance certification.

## Full interface (0.2.0)

The default stdio catalog contains 215 tools: all 207 official tool definitions are compared for exact equality with a separate published REA process, plus eight additions. Original prompt definitions are compared as well; the workflow resource and resource-template behavior are checked. Unknown original tool calls preserve protocol failure. The real integration exercises the RL, PNG, OKF and frontend additions. Compact mode retains eight tools, and original CLI help is delegated through `rea-rl official --help`.

The Ghidra native check opens and analyzes through direct original tools, retrieves procedures through `rea_run`, then closes directly. It passed with 228 procedures, nonempty C-like pseudocode and assembly, demonstrating shared target state across both interfaces. This does not imply every original tool/provider was executed. IDA, Hopper and Kuna retain upstream platform and setup requirements.

Version 0.2.1 also verifies RL feedback after a direct original tool call. With a single matching pending recommendation, the original result is retained and linked without changing the direct response. When two matching recommendations are pending, auto-linking is disabled; callers can explicitly bind the intended decision through `rea_run`.

The earlier validation below records the initial product and provider checks.

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
