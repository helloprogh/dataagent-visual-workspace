# Build verification status

## Dependency baseline

The project is pinned to the same generation of tooling used by `@copilotkit/vue@1.64.1` itself:

- `@copilotkit/vue` / `@copilotkit/core`: 1.64.1
- `@ag-ui/client`: 0.0.57
- `zod`: 3.25.76
- `vue`: 3.5.28
- `vite`: 6.0.0
- `@vitejs/plugin-vue`: 5.2.1
- `typescript`: 5.8.2
- `vue-tsc`: 2.1.10

This avoids the previous Vite 8 + TypeScript 6 cross-generation toolchain.

## Checks completed in the delivery environment

- Local source/import integrity: PASS (42 source files)
- TypeScript syntax transpilation: PASS (40 TS / Vue script blocks, 0 syntax errors)
- CSS parse: PASS
- CopilotKit v1.64.1 API source review: PASS
  - `CopilotKitProvider.selfManagedAgents` exists
  - `useFrontendTool` accepts Zod parameters, handler and render
  - `useAgent` accepts reactive agentId/threadId/throttleMs
  - `CopilotChat` accepts agentId/threadId/throttleMs/labels and emits `submit-message`
- Static visual preview rendered with Chromium via Playwright: PASS

## Why `npm install && npm run build` cannot be completed inside this environment

The execution container has outbound network restrictions. Both npmjs and npmmirror fail before package resolution. The npm failure is `EAI_AGAIN` (DNS), and direct HTTPS to a resolved npm registry IP is refused by the environment. This is infrastructure-level egress blocking rather than a project/npm timeout setting.

Run on a network-enabled machine:

```bash
npm run diagnose:npm
npm install
npm run typecheck
npm run build
```

The project intentionally does not hard-code a public or corporate registry in `.npmrc`.
