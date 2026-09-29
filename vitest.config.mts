import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Node env — these specs drive Payload against Postgres, and jsdom's
    // window global makes uploadthing's server guard throw at config import.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // The remote dev DB is slow — schema pull/push alone can eat the default
    // 10s hook budget on first connect.
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
})
