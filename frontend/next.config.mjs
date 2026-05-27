/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  // This creates a minimal production server with only required dependencies
  output: 'standalone',
  
  // Disable telemetry in production
  // eslint: {
  //   ignoreDuringBuilds: true,
  // },
  
  // Optimize images for production
  images: {
    unoptimized: false,
  },
};

export default nextConfig;
