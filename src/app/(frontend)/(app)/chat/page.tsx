import { redirect } from 'next/navigation'

import { ChatClient } from '@/components/chat/ChatClient'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Chat' }

export default async function ChatPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Chat</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Live chats with mutual follows who are online right now. Messages disappear when the
          conversation ends — nothing is saved.
        </p>
      </div>
      <ChatClient />
    </div>
  )
}
