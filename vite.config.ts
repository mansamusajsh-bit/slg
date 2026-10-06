import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

const staticFilesToCopy = [
  'seedEngine.js',
  'mapSchema.js',
  'config.js',
  'skillEngine.js',
  'nationRules.js',
  'skillEditor.js',
  'ui.js',
  'dbManager.js',
  'game.js',
  'civ4-editor.js',
  'supabase-bridge.js',
  'supabase-config.js',
];

function copyGameScriptsPlugin() {
  return {
    name: 'copy-game-scripts',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      for (const file of staticFilesToCopy) {
        const src = path.resolve(__dirname, file);
        const dest = path.resolve(outDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), copyGameScriptsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
