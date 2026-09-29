import { redirect } from 'next/navigation'

import { ChatClient } from '@/components/chat/ChatClient'
import { getCurrentUser } from '@/lib/auth'
import { getMutuals } from '@/lib/mutuals'

export const metadata = { title: 'Chat' }

export default async function ChatPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const mutuals = await getMutuals(user)

  return <ChatClient mutuals={mutuals} />
}
