import { getCardsLobby } from '@/actions/cards'
import { CardsLobby } from '@/components/cards/CardsLobby'

export const metadata = { title: 'Card Table' }

export default async function CardsLobbyPage() {
  const lobby = await getCardsLobby()
  return <CardsLobby initial={lobby} />
}
