/** Static export: the whole UI is a client app that talks to the API (or runs the
 *  built-in offline demo when NEXT_PUBLIC_API_URL is empty). Works on Vercel and
 *  on any static host.
 *  externalDir lets the app import the shared domain code that the Edge Function
 *  also uses, so balances, reports and statement PDFs are produced by one library. */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  experimental: { externalDir: true },
};
export default nextConfig;
