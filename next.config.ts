import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // Standalone output is only for the Docker image — the Dockerfile sets
  // BUILD_STANDALONE=1 and copies .next/standalone as the runtime. Vercel
  // does its own output tracing and breaks on standalone builds.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  experimental: {
    // Keep the router cache alive for dynamic pages so navigating back is
    // instant. 0 would disable it entirely; Payload admin warns above 0
    // but that warning only matters for the /admin route which is excluded
    // from the frontend cache anyway.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
