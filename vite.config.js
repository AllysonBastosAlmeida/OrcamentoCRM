import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_ROUTER_BASENAME || '/OrcamentoCRM/';

  return defineConfig({
    plugins: [react()],
    base: base.endsWith('/') ? base : `${base}/`,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('jspdf-autotable')) return 'vendor-jspdf-table';
            if (id.includes('jspdf')) return 'vendor-jspdf';
            if (id.includes('html2canvas')) return 'vendor-html2canvas';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('@azure/msal-')) return 'vendor-msal';
            if (id.includes('react-grid-layout') || id.includes('react-resizable')) return 'vendor-grid';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return undefined;
          },
        },
      },
    },
  });
};
