'use client'

import { memo } from 'react'

import { inviteToVideoke } from '@/actions/videoke'
import { MutualInvitePicker } from '@/components/MutualInvitePicker'
import type { MutualHead } from '@/lib/mutuals'
import type { VideokeRoomData } from '@/lib/videoke'

// Videoke flavour of the shared mutual-invite sheet — the room's members and
// pending invitees define who's already taken, and each pick goes through
// inviteToVideoke which applies the returned room.
export const InvitePicker = memo(function InvitePicker({
  room,
  mutuals,
  onRoom,
}: {
  room: VideokeRoomData
  mutuals: MutualHead[]
  onRoom: (room: VideokeRoomData) => void
}) {
  return (
    <MutualInvitePicker
      members={room.members}
      invitees={room.invites.map((i) => i.user)}
      mutuals={mutuals}
      onInvite={async (id) => {
        const res = await inviteToVideoke(room.id, [id])
        if (res.ok && res.room) onRoom(res.room)
        return res
      }}
    />
  )
})
