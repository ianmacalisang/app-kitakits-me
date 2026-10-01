import { notFound, redirect } from 'next/navigation'

import { getChatMutuals } from '@/actions/chat'
import { getNhieGate, getNhieRoom } from '@/actions/nhie'
import { NhieGate } from '@/components/nhie/NhieGate'
import { NhieRoom } from '@/components/nhie/NhieRoom'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Never Have I Ever' }

export default async function NhieRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const roomId = Number((await params).id)
  if (!Number.isInteger(roomId) || roomId <= 0) notFound()

  const [user, room] = await Promise.all([getCurrentUser(), getNhieRoom(roomId)])
  if (!user) redirect('/login')

  // Members and invitees land in the room; everyone else gets the knock
  // gate — coming back (or first entry) needs the host's permission.
  if (!room) return <NhieGate roomId={roomId} gate={await getNhieGate(roomId)} />

  // The invite picker pages client-side — give it the full first 200.
  const mutuals = await getChatMutuals(1, 200)

  return <NhieRoom initial={room} mutuals={mutuals.items} viewerId={user.id} />
}
