import { notFound, redirect } from 'next/navigation'

import { getChatMutuals } from '@/actions/chat'
import { getVideokeGate, getVideokeRoom } from '@/actions/videoke'
import { VideokeGate } from '@/components/videoke/VideokeGate'
import { VideokeRoom } from '@/components/videoke/VideokeRoom'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Videoke room' }

export default async function VideokeRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const roomId = Number((await params).id)
  if (!Number.isInteger(roomId) || roomId <= 0) notFound()

  const [user, room] = await Promise.all([getCurrentUser(), getVideokeRoom(roomId)])
  if (!user) redirect('/login')

  // Members and invitees land in the room; everyone else gets the knock
  // gate — coming back (or first entry) needs the host's permission.
  if (!room) return <VideokeGate roomId={roomId} gate={await getVideokeGate(roomId)} />

  // InvitePicker pages client-side — give it the full first 200.
  const mutuals = await getChatMutuals(1, 200)

  return <VideokeRoom initial={room} mutuals={mutuals.items} viewerId={user.id} />
}
