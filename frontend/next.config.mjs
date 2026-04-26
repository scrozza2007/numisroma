/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
let apiHost;
try {
  apiHost = new URL(apiUrl).hostname;
} catch {
  apiHost = undefined;
}

const baseDomains = ['localhost', 'numismatics.org', 'gallica.bnf.fr','finds.org.uk','ikmk.smb.museum','media.britishmuseum.org','exploratorium.galloromeinsmuseum.be','numid.uni-mainz.de','www.ikmk.at','archaeologie.uni-muenster.de','www.kenom.de'];
const domains = apiHost && !baseDomains.includes(apiHost) ? [...baseDomains, apiHost] : baseDomains;

const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_API_URL: apiUrl
  },
  images: {
    domains,
    unoptimized: true
  }
};

export default nextConfig;
