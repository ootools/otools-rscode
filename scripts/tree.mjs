/**
 * 合成构建树 `.build/`。
 * ------------------------------------------------------------------
 * upstream/ 是 Sidenai/sidex 前端在锁定提交上的**原样快照**，
 * 不要就地修改。所有移植改动都在 shell/ 里：
 *   - shell/shim/     Tauri → OTools 宿主适配层（Vite alias 指过去）
 *   - shell/src/      少量必须替换的上游文件（覆盖同名路径）
 *   - shell/tests/    移植层自己的回归测试
 *   - shell/index.html、vite.config.ts、vitest.config.ts
 *
 * `.build/` 是产物目录，随时可以删掉重建。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const buildDir = path.join(repoRoot, '.build');
export const distDir = path.join(repoRoot, 'dist');

const SKIP_NAMES = new Set(['node_modules', '.git', '.DS_Store', 'target', 'dist', 'dist-pack']);

export function walk(dir, base = dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        if (SKIP_NAMES.has(name)) continue;
        const full = path.join(dir, name);
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) walk(full, base, out);
        else if (stat.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
    }
    return out;
}

function copyTree(from, to) {
    if (!fs.existsSync(from)) throw new Error(`缺少目录：${from}`);
    fs.mkdirSync(to, { recursive: true });
    for (const relative of walk(from)) {
        const source = path.join(from, relative);
        const target = path.join(to, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
    }
}

/** 只做「一行文案」级别的替换，并断言命中次数，避免上游漂移后静默失效。 */
const TEXT_PATCHES = [
    {
        // Plugin pages live on `otools-plugin://`, not `/`: absolute fetches
        // resolve against the host root and silently miss the bundled asset.
        file: 'src/nls-loader.ts',
        find: "fetch('/nls.messages.json')",
        replace: "fetch('./nls.messages.json')",
        expected: 1,
    },
    {
        // The Go agent server is a native sidecar and cannot ship in a pure
        // webview plugin; avoid telling users to build a binary they don't have.
        file: 'src/vs/workbench/contrib/sidexChat/browser/sidexChatService.ts',
        find: 'The local AI server is not running. Chat cannot send until sidex-server is built and the app is restarted.',
        replace: 'The local AI agent is unavailable in the OTools plugin. Editor features are unaffected.',
        expected: 1,
    },
    {
        file: 'src/vs/platform/product/common/product.ts',
        find: "nameShort: 'SideX',",
        replace: "nameShort: 'RSCode',",
        expected: 1,
    },
    {
        file: 'src/vs/platform/product/common/product.ts',
        find: "nameLong: 'SideX',",
        replace: "nameLong: 'RSCode Editor',",
        expected: 1,
    },
    {
        file: 'src/bootstrap-globals.ts',
        find: "nameShort: 'SideX',",
        replace: "nameShort: 'RSCode',",
        expected: 1,
    },
    {
        file: 'src/bootstrap-globals.ts',
        find: "nameLong: 'SideX',",
        replace: "nameLong: 'RSCode Editor',",
        expected: 1,
    },
    {
        file: 'src/vs/workbench/browser/parts/titlebar/titlebarPart.ts',
        find: "this.projectNameElement.textContent = name || 'SideX';",
        replace: "this.projectNameElement.textContent = name || 'RSCode';",
        expected: 1,
    },
    {
        // Upstream only uses the fixed bundled worker URLs under `tauri:`.
        // Plugin pages are served from `otools-plugin://`, so Vite's copied
        // source asset would be imported instead of the bundled worker.
        file: 'src/vs/platform/webWorker/browser/webWorkerServiceImpl.ts',
        find: `		const isTauriProduction =
			(globalThis as typeof globalThis & { __SIDEX_TAURI__?: boolean }).__SIDEX_TAURI__ === true &&
			globalThis.location?.protocol === 'tauri:';
		if (isTauriProduction) {
			if (descriptor.label === 'editorWorkerService') {
				return \`\${globalThis.location.origin}/assets/editorWorker.js\`;
			}
			if (descriptor.label === 'TextMateWorker') {
				return \`\${globalThis.location.origin}/assets/textMateWorker.js\`;
			}
			if (descriptor.label === 'extensionHostWorkerMain') {
				return \`\${globalThis.location.origin}/assets/extensionHostWorker.js\`;
			}
		}`,
        replace: `		if ((globalThis as any).__SIDEX_OTools__ === true) {
			const bundled: Record<string, string> = {
				editorWorkerService: 'editorWorker.js',
				TextMateWorker: 'textMateWorker.js',
				extensionHostWorkerMain: 'extensionHostWorker.js'
			};
			const name = bundled[descriptor.label];
			if (name) return new URL(\`./assets/\${name}\`, document.baseURI).toString();
		}`,
        expected: 1,
    },
    {
        // The bundled core chunk uses the global `window` in a few VS Code
        // helpers even when running inside a module worker. Give workers a
        // self-reference before the dynamic import, as Tauri's runtime does.
        file: 'src/vs/platform/webWorker/browser/webWorkerServiceImpl.ts',
        find: '`globalThis.__SIDEX_TAURI__ = ${JSON.stringify(!!(globalThis as any).__SIDEX_TAURI__)};`,',
        replace: "`globalThis.__SIDEX_TAURI__ = ${JSON.stringify(!!(globalThis as any).__SIDEX_TAURI__)};`," +
            "\n\t\t\t\t`if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;`," +
            "\n\t\t\t\t`if (typeof globalThis.document === 'undefined') globalThis.document = { baseURI: String(globalThis.location?.href || ''), queryCommandSupported: () => false };`," +
            "\n\t\t\t\t`for (const k of ['HTMLElement', 'HTMLDivElement', 'HTMLIFrameElement', 'Element', 'Node', 'Text', 'DocumentFragment', 'ShadowRoot', 'Event', 'UIEvent', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'DragEvent', 'ClipboardEvent', 'MutationObserver', 'DOMParser', 'XMLSerializer', 'NodeFilter', 'Range', 'Selection']) if (typeof globalThis[k] === 'undefined') globalThis[k] = class {};`," +
            "\n\t\t\t\t`if (typeof globalThis.customElements === 'undefined') globalThis.customElements = { define() {}, get() {}, whenDefined() { return Promise.resolve(); } };`," +
            "\n\t\t\t\t`if (typeof globalThis.document !== 'undefined') { const stubEl = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, removeAttribute() {}, append() {}, appendChild() {}, addEventListener() {}, removeEventListener() {}, focus() {}, querySelector() { return null; } }); globalThis.document.createElement ??= stubEl; globalThis.document.createElementNS ??= stubEl; globalThis.document.createTextNode ??= (t) => ({ textContent: t }); globalThis.getComputedStyle ??= () => ({}); globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(Date.now()), 0); globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id); }`," ,
        expected: 1,
    },
];

function applyTextPatches() {
    for (const patch of TEXT_PATCHES) {
        const file = path.join(buildDir, patch.file);
        if (!fs.existsSync(file)) throw new Error(`补丁目标不存在：${patch.file}`);
        const text = fs.readFileSync(file, 'utf8');
        const count = text.split(patch.find).length - 1;
        if (count !== patch.expected) {
            throw new Error(`补丁失效：${patch.file} 期望命中 ${patch.expected} 次，实际 ${count} 次。上游可能已改版，请同步 shell/ 里的适配层。`);
        }
        fs.writeFileSync(file, text.split(patch.find).join(patch.replace));
    }
}

/** 生成 .build/ 并返回路径；重复调用会先清空旧树。 */
export function prepareTree() {
    // Do not bulk-delete `.build/`: it is a generated tree and the local
    // safe-delete guard rejects recursive removal of thousands of files.
    // Copying with overwrite is enough because the whitelist is stable.
    fs.mkdirSync(buildDir, { recursive: true });

    copyTree(path.join(repoRoot, 'upstream', 'src'), path.join(buildDir, 'src'));
    copyTree(path.join(repoRoot, 'upstream', 'public'), path.join(buildDir, 'public'));
    copyTree(path.join(repoRoot, 'upstream', 'scripts'), path.join(buildDir, 'scripts'));
    copyTree(path.join(repoRoot, 'shell', 'shim'), path.join(buildDir, 'shim'));
    copyTree(path.join(repoRoot, 'shell', 'src'), path.join(buildDir, 'src'));
    copyTree(path.join(repoRoot, 'shell', 'tests'), path.join(buildDir, 'tests'));

    for (const name of ['index.html', 'vite.config.ts', 'vitest.config.ts']) {
        fs.copyFileSync(path.join(repoRoot, 'shell', name), path.join(buildDir, name));
    }
    // Upstream uses TypeScript parameter decorators for VS Code's DI. esbuild
    // reads the nearest tsconfig; without this copy the build fails instantly.
    for (const name of ['tsconfig.json', 'tsconfig.node.json']) {
        fs.copyFileSync(path.join(repoRoot, 'upstream', name), path.join(buildDir, name));
    }
    fs.copyFileSync(path.join(repoRoot, 'logo.svg'), path.join(buildDir, 'public', 'logo.svg'));

    // Upstream generates this from its extensions catalog before every build.
    // The plugin ships no extension host, so an empty descriptor list is enough.
    const generated = spawnSync(process.execPath, [path.join(buildDir, 'scripts', 'generate-extension-meta.js')], {
        cwd: buildDir,
        encoding: 'utf8',
    });
    if (generated.status !== 0) {
        throw new Error(`生成 builtin-extensions.js 失败：${generated.stderr || generated.stdout || generated.error}`);
    }

    applyTextPatches();
    return { buildDir, distDir };
}

export const viteBin = () => path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
export const vitestBin = () => path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
export const tscBin = () => path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

export function assertDeps() {
    for (const [name, bin] of [['vite', viteBin()], ['vitest', vitestBin()], ['typescript', tscBin()]]) {
        if (!fs.existsSync(bin)) {
            console.error(`找不到 ${name}。先在仓库根执行：npm install --legacy-peer-deps`);
            process.exit(1);
        }
    }
}
