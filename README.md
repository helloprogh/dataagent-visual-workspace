# DataAgent · OpenCode2 AG-UI Adapter

A local full-stack debugging workspace for connecting a Vue data-intelligence UI to OpenCode2 through a standard AG-UI event stream.

## Architecture

```text
Vue workspace
  └─ POST RunAgentInput
      └─ AG-UI adapter :3001
          ├─ /agui/mock    standard AG-UI mock stream
          ├─ /agui         OpenCode2 → AG-UI conversion
          ├─ /agui/hybrid  OpenCode2 events + workspace fixtures
          ├─ /agui/replay  replay captured OpenCode2 events
          └─ /opencode/*   transparent OpenCode2 API proxy
```

The adapter, rather than OpenCode2, owns `RUN_STARTED → RUN_FINISHED | RUN_ERROR`. It correlates OpenCode session, message, part, and tool call IDs and rebuilds valid text, reasoning, tool, step, and custom sub-agent lifecycles.

## Quick start

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. The production-style default is an empty workspace; choose the mock endpoint in the right panel to build it dynamically through AG-UI.

To start with static demo data:

```bash
npm run dev:demo
```

Demo and production workspaces use separate local-storage keys:

```text
dataagent.workspace.v3.prod
dataagent.workspace.v3.demo
```

## Connect local OpenCode2

```powershell
opencode serve --hostname 127.0.0.1 --port 4096
$env:OPENCODE_BASE_URL='http://127.0.0.1:4096'
npm run dev
```

Select `OpenCode2 · 实时转换` in the frontend, or set:

```env
VITE_AGUI_URL=http://127.0.0.1:3001/agui
```

## Validation

```bash
npm test
npm run typecheck
npm run build
npm run check
```

The adapter deliberately has no runtime npm dependencies. See [event mapping](adapter/docs/EVENT-MAPPING.md) and [debug modes](adapter/docs/FRONTEND-DEBUG.md) for protocol details.

