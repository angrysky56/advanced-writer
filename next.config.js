/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // chromadb (and the neo4j driver) are server-only native packages. Leave them
  // as runtime requires instead of bundling them — otherwise the bundler tries
  // to resolve chromadb's OPTIONAL default embedding provider
  // ('@chroma-core/default-embed'), which we don't install because we use the
  // Ollama embedding function. Externalizing silences both the "Critical
  // dependency" warning and the "Can't resolve '@chroma-core/default-embed'"
  // error, and the optional provider is never loaded at runtime.
  serverExternalPackages: ["chromadb", "@chroma-core/ollama", "neo4j-driver"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
