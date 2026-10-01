'use client'

import { memo } from 'react'

import { getNhieVoiceTicket } from '@/actions/nhie'
import { VoiceMic } from '@/components/VoiceMic'

// Voice for an NHIE circle — every member can publish (it's a hangout, not a
// stage), so the mic is always offered and the denied path is unreachable
// in practice; it stays for the non-member edge the SFU would reject anyway.
export const NhieMic = memo(function NhieMic({
  roomId,
  onSpeakers,
}: {
  roomId: number
  onSpeakers?: (ids: number[]) => void
}) {
  return (
    <VoiceMic
      roomId={roomId}
      canSpeak
      getTicket={getNhieVoiceTicket}
      deniedMessage="Only players in this room can use the mic."
      idleLabel="Circle chat is open"
      audioProfile="speech"
      onSpeakers={onSpeakers}
    />
  )
})
