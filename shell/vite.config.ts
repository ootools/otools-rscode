import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { nlsPlugin } from './scripts/vite-plugin-nls';

/**
 * Build config for the composed tree (`.build/`).
 *
 * Every `@tauri-apps/*` specifier is redirected to a shim that talks to the
 * OTools host. `base: './'` is mandatory: the host serves the entry from an
 * `otools-plugin://` origin, where absolute `/assets/...` URLs do not resolve.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const shim = (file: string) => path.join(root, 'shim', file);
const src = (file: string) => path.join(root, 'src', file);

export default defineConfig({
  root,
  base: './',
  publicDir: path.join(root, 'public'),
  clearScreen: false,
  assetsInclude: ['**/*.wasm', '**/*.json', '**/*.tmLanguage.json'],
  plugins: [nlsPlugin()],
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: [
      { find: /^@tauri-apps\/api\/core$/, replacement: shim('core.ts') },
      { find: /^@tauri-apps\/api\/event$/, replacement: shim('event.ts') },
      { find: /^@tauri-apps\/api\/window$/, replacement: shim('window.ts') },
      { find: /^@tauri-apps\/plugin-dialog$/, replacement: shim('dialog.ts') },
      { find: /^@tauri-apps\/plugin-shell$/, replacement: shim('shell.ts') },
      { find: /^vs$/, replacement: path.join(root, 'src', 'vs') },
    ],
  },
  build: {
    outDir: path.resolve(root, '..', 'dist'),
    emptyOutDir: true,
    target: ['es2022', 'chrome100', 'safari15'],
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: {
        index: path.join(root, 'index.html'),
        textMateWorker: src('vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.workerMain.ts'),
        editorWorker: src('vs/editor/common/services/editorWebWorkerMain.ts'),
        extensionHostWorker: src('vs/workbench/api/worker/extensionHostWorkerMain.ts'),
        nls: src('vs/nls.ts'),
      },
      output: {
        entryFileNames: (chunkInfo: { name: string }) => {
          const fixed: Record<string, string> = {
            editorWorker: 'assets/editorWorker.js',
            textMateWorker: 'assets/textMateWorker.js',
            extensionHostWorker: 'assets/extensionHostWorker.js',
            nls: 'assets/nls.js',
          };
          return fixed[chunkInfo.name] ?? 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo: { name?: string }) => {
          if ((assetInfo.name ?? '').endsWith('.ts')) {
            return `assets/${(assetInfo.name ?? 'asset').slice(0, -3)}-[hash].js`;
          }
          return 'assets/[name]-[hash][extname]';
        },
        manualChunks(id: string) {
          if (id.endsWith('/vs/nls.ts') || id.endsWith('/vs/nls.js') || id.endsWith('/vs/nls.mock.js')) return 'nls';
          if (
            id.includes('/vs/base/') ||
            id.endsWith('/vs/amdX.ts') ||
            id.endsWith('/vs/sidex-bridge.ts') ||
            id.includes('xterm') ||
            id.includes('/terminal/') ||
            (id.includes('/vs/editor/') && !id.includes('/workbench/')) ||
            id.includes('/vs/platform/')
          ) {
            return 'core';
          }
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: ['vscode-textmate', 'vscode-oniguruma'],
    exclude: ['@tauri-apps/api'],
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'workers/[name]-[hash].js',
        chunkFileNames: 'workers/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5395,
    strictPort: true,
    host: '127.0.0.1',
  },
});
