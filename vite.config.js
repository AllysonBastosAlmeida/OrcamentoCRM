import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_ROUTER_BASENAME || '/OrcamentoCRM/';

  return defineConfig({
    plugins: [react()],
    base: base.endsWith('/') ? base : `${base}/`,
  });
};
