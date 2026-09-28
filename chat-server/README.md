# Kitakits Chat Server

Standalone WebSocket service for ephemeral 1:1 chat between mutual follows.
Everything lives in process memory — presence, invites, rooms, replay buffers.
**No database.** Clients authenticate with a short-lived HS256 "chat ticket"
minted by the app's `getChatTicket()` server action (`src/actions/chat.ts`).

## Run

```bash
# dev — loads .env from the repo root
npm run dev:chat        # or: node --env-file=.env chat-server/server.mjs

# direct
node chat-server/server.mjs
```

Health check for load balancers/Coolify: `GET /health` → `200 ok`.

## Environment

| Var                   | Default              | Purpose                                        |
| --------------------- | -------------------- | ---------------------------------------------- |
| `WS_PORT`             | `3001`               | Listen port                                    |
| `CHAT_TICKET_SECRET`  | `PAYLOAD_SECRET`     | HS256 key shared with the app for ticket JWTs  |
| `ALLOWED_ORIGIN`      | _(allow all)_        | Comma-separated browser origins for upgrades   |
| `CHAT_PURGE_GRACE_MS` | `60000`              | Room buffer retention after everyone leaves    |
| `CHAT_INVITE_TTL_MS`  | `120000`             | Invite expiry                                  |
| `CHAT_AUTH_TIMEOUT_MS`| `5000`               | How long a socket may stay unauthenticated     |
| `CHAT_KEEPALIVE_MS`   | `30000`              | ws ping interval (dead-socket reaping)         |

## Coolify

Add a second service to the project using `Dockerfile.chat`. Point a domain
like `ws.kitakits.me` at port `3001` — Traefik terminates TLS and upgrades
`wss://` automatically. Set `CHAT_TICKET_SECRET` (same value in both services),
`ALLOWED_ORIGIN=https://kitakits.me`, and `NEXT_PUBLIC_CHAT_WS_URL=wss://ws.kitakits.me`
on the **app** service.

## Protocol

First client frame must be `{"type":"auth","ticket":"<jwt>"}` — the ticket's
`mutuals` claim is the allow-list for invites. See `server.mjs` for message
types (`invite`, `accept`, `decline`, `join`, `msg`, `leave` → `presence:*`,
`invite:*`, `joined`, `msg`, `peer:left`, `peer:joined`, `room:ended`).
