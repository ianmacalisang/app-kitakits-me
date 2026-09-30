import { notFound, redirect } from 'next/navigation'

import { getCardsGate, getCardRoom } from '@/actions/cards'
import { getChatMutuals } from '@/actions/chat'
import { CardGate } from '@/components/cards/CardGate'
import { CardsRoom } from '@/components/cards/CardsRoom'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Card table' }

export default async function CardRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const roomId = Number((await params).id)
  if (!Number.isInteger(roomId) || roomId <= 0) notFound()

  const [user, room] = await Promise.all([getCurrentUser(), getCardRoom(roomId)])
  if (!user) redirect('/login')

  // Members and invitees land in the room; everyone else gets the knock
  // gate — coming back (or first entry) needs the host's permission.
  if (!room) return <CardGate roomId={roomId} gate={await getCardsGate(roomId)} />

  // The invite picker pages client-side — give it the full first 200.
  const mutuals = await getChatMutuals(1, 200)

  return <CardsRoom initial={room} mutuals={mutuals.items} viewerId={user.id} />
}
