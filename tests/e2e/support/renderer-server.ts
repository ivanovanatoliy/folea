import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import solid from 'vite-plugin-solid';

export const startRendererDevServer = async (): Promise<{
  server: ViteDevServer;
  url: string;
}> => {
  const server = await createServer({
    appType: 'spa',
    configFile: false,
    root: path.join(process.cwd(), 'src/renderer'),
    plugins: [solid()],
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      fs: { allow: [process.cwd()] }
    },
    optimizeDeps: {
      include: [
        '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs',
        '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs'
      ]
    },
    worker: { format: 'es' }
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) {
    await server.close();
    throw new Error('Vite dev server did not expose a local URL');
  }
  return { server, url };
};
