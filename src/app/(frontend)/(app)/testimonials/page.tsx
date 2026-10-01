import { redirect } from 'next/navigation'

import { getReceivedTestimonials, getWrittenTestimonials } from '@/actions/testimonials'
import { TestimonialsView } from '@/components/TestimonialsView'
import { getCurrentUser } from '@/lib/auth'
import { TESTIMONIAL_TABS, type TestimonialTab } from '@/lib/tabs'

export const metadata = { title: 'Testimonials' }

export default async function TestimonialsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // ?tab= persists the selected tab across refreshes (e.g. /testimonials?tab=review).
  const { tab: rawTab } = await searchParams
  const initialTab: TestimonialTab | undefined = (TESTIMONIAL_TABS as readonly string[]).includes(
    rawTab ?? '',
  )
    ? (rawTab as TestimonialTab)
    : undefined

  const [pending, received, written] = await Promise.all([
    getReceivedTestimonials('pending'),
    getReceivedTestimonials('resolved'),
    getWrittenTestimonials(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Testimonials</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Testimonials only show on your profile after you approve them.
        </p>
      </div>
      <TestimonialsView
        pending={pending.items}
        pendingHasMore={pending.hasMore}
        received={received.items}
        receivedHasMore={received.hasMore}
        written={written.items}
        writtenHasMore={written.hasMore}
        initialTab={initialTab}
      />
    </div>
  )
}
