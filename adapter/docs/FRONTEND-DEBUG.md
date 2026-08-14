# Frontend debugging modes

## Mock

Set `VITE_AGUI_URL=http://127.0.0.1:3001/agui/mock`. This exercises a real HTTP request and standard AG-UI SSE stream without requiring OpenCode2.

## OpenCode2

Start OpenCode locally and set `OPENCODE_BASE_URL=http://127.0.0.1:4096`. Point the frontend to `http://127.0.0.1:3001/agui`.

## Hybrid

Point the frontend to `http://127.0.0.1:3001/agui/hybrid` to combine converted OpenCode events with workspace mock events for UI development.

## Replay

POST a `RunAgentInput`, `sessionId`, and captured `events` array to `/agui/replay`. See `fixtures/opencode-events.json` for a minimal capture.

