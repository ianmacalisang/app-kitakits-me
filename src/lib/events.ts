// Client-side events used to keep mounted feeds in sync with actions taken
// on a post card (e.g. saving a post from the Feed should update the Saved tab
// without a full page refresh).
export const POST_SAVE_TOGGLED = 'kitakits:post-save-toggled'

export interface PostSaveToggledDetail {
  postId: number
  saved: boolean
}

// Server-pushed live events — the chat-server relays these over the app-wide
// socket and ChatProvider re-dispatches them as window events, so any
// component can subscribe without a context dependency.
export const LIVE_EVENT = 'kitakits:live'

export type LiveEventDetail =
  | { type: 'badges' }
  | { type: 'feed:new'; authorId: number }
  | { type: 'video:status'; videoId: number; status: string }
  | { type: 'videoke:update'; roomId: number }
  | { type: 'videoke:invite'; roomId: number; from: string }

// Lightweight toast hints — any client component can fire one and the
// ToastHost mounted in the app layout renders it.
export const TOAST_EVENT = 'kitakits:toast'

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent<{ message: string }>(TOAST_EVENT, { detail: { message } }))
}
