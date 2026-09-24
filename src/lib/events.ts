// Client-side events used to keep mounted feeds in sync with actions taken
// on a post card (e.g. saving a post from For You should update the Saved tab
// without a full page refresh).
export const POST_SAVE_TOGGLED = 'kitakits:post-save-toggled'

export interface PostSaveToggledDetail {
  postId: number
  saved: boolean
}
