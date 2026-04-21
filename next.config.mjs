/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/images',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'yts.mx',
      },
      {
        protocol: 'https',
        hostname: 'img.yts.mx',
      },
    ],
  },
}

export default nextConfig
