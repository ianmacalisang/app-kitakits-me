import { Spinner } from '@/components/Spinner'

export default function Loading() {
  return (
    <div className="flex min-h-[calc(100dvh-13rem)] items-center justify-center">
      <Spinner />
    </div>
  )
}
