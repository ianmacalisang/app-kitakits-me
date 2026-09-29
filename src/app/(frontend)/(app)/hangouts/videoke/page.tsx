import { getVideokeLobby } from '@/actions/videoke'
import { VideokeLobby } from '@/components/videoke/VideokeLobby'

export const metadata = { title: 'Videoke' }

export default async function VideokeLobbyPage() {
  const lobby = await getVideokeLobby()
  return <VideokeLobby initial={lobby} />
}
