import type { Payload, Where } from 'payload'

export type HangoutKind = 'videoke' | 'cards' | 'nhie'

export interface OpenHangout {
  kind: HangoutKind
  id: number
  name: string | null
  hostId: number | null
  memberCount: number
}

// One hangout at a time — a user is "busy" while they're a member of any
// open room across the three apps. Invitees and knockers aren't members yet,
// so the room-join actions (create + accept-invite) check this, while
// knocking on a room stays free.
//
// Exception: a room where the user is the ONLY member doesn't count — an
// empty room nobody else is in isn't really "being at a hangout", and it
// shouldn't trap a host who opened a room to wait for friends.
export const openHangoutOf = async (
  payload: Payload,
  userId: number,
): Promise<OpenHangout | null> => {
  const where: Where = {
    and: [{ members: { contains: userId } }, { status: { equals: 'open' } }],
  }
  const read = { where, limit: 10, depth: 0, overrideAccess: true } as const
  const [videoke, cards, nhie] = await Promise.all([
    payload.find({ collection: 'videoke-rooms', ...read }),
    payload.find({ collection: 'card-rooms', ...read }),
    payload.find({ collection: 'nhie-rooms', ...read }),
  ])
  const found =
    firstNonSolo('videoke', videoke.docs) ||
    firstNonSolo('cards', cards.docs) ||
    firstNonSolo('nhie', nhie.docs)
  return found ?? null
}

const firstNonSolo = (
  kind: HangoutKind,
  docs: { id: number; host?: unknown; name?: unknown; members?: unknown }[],
): OpenHangout | null => {
  for (const room of docs) {
    const memberCount = Array.isArray(room.members) ? room.members.length : 0
    if (memberCount <= 1) continue // solo room — doesn't gate
    return {
      kind,
      id: room.id,
      name: typeof room.name === 'string' ? room.name : null,
      hostId:
        typeof room.host === 'object' && room.host !== null
          ? (room.host as { id: number }).id
          : typeof room.host === 'number'
            ? room.host
            : null,
      memberCount,
    }
  }
  return null
}

// Shared wording so all three apps refuse a second room the same way.
export const busyHangoutError = (hangout: OpenHangout) =>
  hangout.name
    ? `You're already in “${hangout.name}” — leave it first.`
    : "You're already in a hangout — leave it first."

// A host can't switch rooms — leaving a hosted room ends it for everyone.
export const hostingHangoutError = (hangout: OpenHangout) =>
  hangout.name
    ? `You're hosting “${hangout.name}” — end it first.`
    : "You're hosting a hangout — end it first."

// Leave whichever open room the user is in, by app. Dynamic imports keep the
// three action modules out of a static import cycle (each action file
// imports this lib). Only callable for plain members — a host leave ends the
// room for everyone, which the caller must block explicitly.
export const leaveOpenHangout = async (hangout: OpenHangout, userId: number): Promise<boolean> => {
  if (hangout.hostId === userId) return false
  const res =
    hangout.kind === 'videoke'
      ? await (await import('@/actions/videoke')).leaveVideokeRoom(hangout.id)
      : hangout.kind === 'cards'
        ? await (await import('@/actions/cards')).leaveCardRoom(hangout.id)
        : await (await import('@/actions/nhie')).leaveNhieRoom(hangout.id)
  return res.ok
}

// The one-hangout gate for join actions. Returns null when the user may
// proceed; otherwise a failure the action can return verbatim. With
// `switchRoom`, a plain member's current room is left automatically
// ("Leave & join"); hosts of non-empty rooms always block.
export const hangoutGateError = async (
  payload: Payload,
  userId: number,
  switchRoom: boolean,
): Promise<{ error: string; busyHangout?: OpenHangout } | null> => {
  const busy = await openHangoutOf(payload, userId)
  if (!busy) return null
  if (busy.hostId === userId) return { error: hostingHangoutError(busy) }
  if (!switchRoom) return { error: busyHangoutError(busy), busyHangout: busy }
  if (!(await leaveOpenHangout(busy, userId))) {
    return { error: 'Could not leave your current room.' }
  }
  // Rare but possible: multiple open memberships predating the gate. If any
  // remain, the join still has to wait — the client can offer the switch
  // again and converge.
  const again = await openHangoutOf(payload, userId)
  return again ? { error: busyHangoutError(again), busyHangout: again } : null
}
