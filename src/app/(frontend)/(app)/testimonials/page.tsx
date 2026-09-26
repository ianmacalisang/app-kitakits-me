import { redirect } from 'next/navigation'

import {
  getReceivedTestimonials,
  getWrittenTestimonials,
} from '@/actions/testimonials'
import { TestimonialsView } from '@/components/TestimonialsView'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Testimonials' }

export default async function TestimonialsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

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
      />
    </div>
  )
}
