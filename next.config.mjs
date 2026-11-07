/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Permite enviar os PDFs (pedido e boletos) junto com o lançamento das contas.
    serverActions: { bodySizeLimit: "50mb" },
  },
};
export default nextConfig;
