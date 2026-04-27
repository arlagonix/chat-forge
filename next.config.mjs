/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: "export",
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  basePath: isProd ? "/chat-forge" : "",
  assetPrefix: isProd ? "/chat-forge/" : "",
};

export default nextConfig;
