import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/n8n-bucket-xys/**',
      },
    ],
  },
  webpack: (config) => {
    config.externals.push({
      'fluent-ffmpeg': 'commonjs fluent-ffmpeg'
    });
    return config;
  },
};

export default nextConfig;
