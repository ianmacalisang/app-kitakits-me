import { getNhieLobby } from '@/actions/nhie'
import { NhieLobby } from '@/components/nhie/NhieLobby'

export const metadata = { title: 'Never Have I Ever' }

export default async function NhieLobbyPage() {
  const lobby = await getNhieLobby()
  return <NhieLobby initial={lobby} />
}
