import type { CollectionAfterChangeHook } from 'payload'

// Runs independent afterChange hooks concurrently and never lets a failed
// side effect (notification, counter, points) roll back the mutation that
// triggered it. Remote-DB latency turns a serialized hook chain into a
// multi-second tail on every create — parallelism keeps mutations inside
// serverless time budgets.
export const parallelAfterChange =
  (...hooks: CollectionAfterChangeHook[]): CollectionAfterChangeHook =>
  async (args) => {
    const results = await Promise.allSettled(hooks.map((hook) => hook(args)))
    for (const result of results) {
      if (result.status === 'rejected') {
        args.req.payload.logger.error({
          err: result.reason,
          msg: 'afterChange side effect failed',
        })
      }
    }
  }
