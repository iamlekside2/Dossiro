/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Every page here is static — there are no route handlers, no server actions
  // and no dynamic segments. Exporting to plain files means IIS serves the
  // marketing site directly and the server runs one Node process instead of
  // two, with nothing to keep alive, restart or monitor for a set of pages
  // that never change between deploys.
  output: 'export',

  // IIS serves /about as a directory, so the file has to be about/index.html
  // rather than about.html. Without this every inner page 404s.
  trailingSlash: true,

  // next/image optimisation needs a server. The site's images are already
  // sized for their slots.
  images: { unoptimized: true },
};

export default nextConfig;
