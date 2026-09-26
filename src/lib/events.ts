// Client-side events used to keep mounted feeds in sync with actions taken
// on a post card (e.g. saving a post from the Feed should update the Saved tab
// without a full page refresh).
export const POST_SAVE_TOGGLED = 'kitakits:post-save-toggled'

export interface PostSaveToggledDetail {
  postId: number
  saved: boolean
}

// Lightweight toast hints — any client component can fire one and the
// ToastHost mounted in the app layout renders it.
export const TOAST_EVENT = 'kitakits:toast'

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent<{ message: string }>(TOAST_EVENT, { detail: { message } }))
}
