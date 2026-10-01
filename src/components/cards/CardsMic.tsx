'use client'

import { memo } from 'react'

import { getCardsVoiceTicket } from '@/actions/cards'
import { VoiceMic } from '@/components/VoiceMic'

// Voice for a card table — every member can publish (it's a hangout, not a
// stage), so the mic is always offered and the denied path is unreachable
// in practice; it stays for the non-member edge the SFU would reject anyway.
export const CardsMic = memo(function CardsMic({
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
      getTicket={getCardsVoiceTicket}
      deniedMessage="Only players in this room can use the mic."
      idleLabel="Table chat is open"
      audioProfile="speech"
      onSpeakers={onSpeakers}
    />
  )
})
