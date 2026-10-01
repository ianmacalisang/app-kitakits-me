'use client'

import { memo } from 'react'

import { getVideokeVoiceTicket } from '@/actions/videoke'
import { VoiceMic } from '@/components/VoiceMic'

// "Use mic" control on the stage transport bar — the videoke flavour of the
// shared VoiceMic. Only the host and the member who queued the playing song
// may publish (`canSpeak`); everyone else gets a passive chip showing who's
// on the mic.
export const MicMeter = memo(function MicMeter({
  roomId,
  canSpeak,
  onSpeakers,
}: {
  roomId: number
  canSpeak: boolean
  onSpeakers?: (ids: number[]) => void
}) {
  return (
    <VoiceMic
      roomId={roomId}
      canSpeak={canSpeak}
      getTicket={getVideokeVoiceTicket}
      deniedMessage="Only the host and the singer on stage can use the mic."
      idleLabel="Only the host & singer can sing"
      audioProfile="music"
      onSpeakers={onSpeakers}
    />
  )
})
