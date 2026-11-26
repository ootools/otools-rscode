/**
 * App-level state commands: settings, secrets, storage and system metadata.
 * Persistent values live in `~/.otools/local/otools-rscode/` via hostStore;
 * browser preview falls back to web storage.
 */
import { hostCommand } from '../hostCommand';
import { kvGet, kvSet } from '../util';

type Args = Record<string, any>;

let settings: Record<string, any> | null = null;
let userLayer: Record<string, any> = {};
let workspaceLayer: Record<string, any> = {};

async function ensureSettings(): Promise<void> {
    if (settings) return;
    const stored = await kvGet<{ user?: Record<string, any>; workspace?: Record<string, any> }>('settings');
    userLayer = stored?.user ?? {};
    workspaceLayer = stored?.workspace ?? {};
    settings = { ...userLayer, ...workspaceLayer };
}

async function persistSettings(): Promise<void> {
    await kvSet('settings', { user: userLayer, workspace: workspaceLayer });
}

export async function settingsGet(args: Args): Promise<unknown> {
    await ensureSettings();
    if (args.section !== undefined && args.section !== null) {
        return settings![String(args.section)] ?? null;
    }
    switch (args.scope) {
        case 'user': return userLayer;
        case 'workspace': return workspaceLayer;
        default: return settings;
    }
}

export async function settingsUpdate(args: Args): Promise<void> {
    await ensureSettings();
    const key = String(args.key ?? '');
    const value = args.value ?? null;
    const scope = String(args.scope ?? 'user');
    if (scope === 'workspace') workspaceLayer[key] = value;
    else userLayer[key] = value;
    settings = { ...userLayer, ...workspaceLayer };
    await persistSettings();
}

export async function settingsLoad(args: Args): Promise<void> {
    // Upstream loads JSONC settings files from disk. The plugin keeps one
    // canonical user layer; importing a file simply overlays its keys.
    if (typeof args.path !== 'string') return;
    const { readFile } = await import('./fs');
    try {
        const raw = await readFile({ path: args.path });
        const parsed = JSON.parse(raw.replace(/\/\/.*$/gm, ''));
        if (parsed && typeof parsed === 'object') {
            userLayer = { ...userLayer, ...parsed };
            settings = { ...userLayer, ...workspaceLayer };
            await persistSettings();
        }
    } catch { /* a missing or invalid file leaves settings untouched */ }
}

const secretPrefix = 'secret:';
export async function secretGet(args: Args): Promise<string | null> {
    return (await kvGet<string>(`${secretPrefix}${String(args.key ?? '')}`)) ?? null;
}
export async function secretSet(args: Args): Promise<void> {
    await kvSet(`${secretPrefix}${String(args.key ?? '')}`, String(args.value ?? ''));
}
export async function secretDelete(args: Args): Promise<void> {
    await kvSet(`${secretPrefix}${String(args.key ?? '')}`, null);
}
export async function secretKeys(): Promise<string[]> {
    return [];
}

const storagePrefix = 'storage:';
export async function storageSet(args: Args): Promise<void> {
    await kvSet(`${storagePrefix}${String(args.key ?? '')}`, args.value ?? null);
}
export async function storageDelete(args: Args): Promise<void> {
    await kvSet(`${storagePrefix}${String(args.key ?? '')}`, null);
}

let homeCache = '';
async function homeDir(): Promise<string> {
    if (homeCache) return homeCache;
    try {
        homeCache = String((await hostCommand<string>('tools_webview_home_dir')) ?? '');
    } catch {
        homeCache = '';
    }
    return homeCache;
}

export async function getEnv(args: Args): Promise<string | null> {
    const key = String(args.key ?? '').toUpperCase();
    const home = await homeDir();
    if (key === 'HOME' || key === 'USERPROFILE') return home || null;
    if (key === 'TMPDIR' || key === 'TEMP' || key === 'TMP') return '/tmp';
    if (key === 'PATH') return '/usr/bin:/bin:/usr/local/bin';
    if (key === 'SHELL') return '/bin/zsh';
    if (key === 'USER' || key === 'USERNAME') return 'otools';
    return null;
}

export async function getAllEnv(): Promise<Record<string, string>> {
    const home = await homeDir();
    return {
        HOME: home,
        USERPROFILE: home,
        PATH: '/usr/bin:/bin:/usr/local/bin',
        SHELL: '/bin/zsh',
        TMPDIR: '/tmp',
    };
}

export async function getOsInfo(): Promise<unknown> {
    const platform = navigator.platform.toLowerCase();
    const isMac = platform.includes('mac');
    const isWindows = platform.includes('win');
    return {
        platform: isMac ? 'macos' : isWindows ? 'windows' : 'linux',
        arch: (globalThis as any).__SIDEX_ARCH__ ?? 'arm64',
        hostname: 'otools-host',
        homedir: await homeDir(),
        tmpdir: '/tmp',
    };
}

export async function getUserDataDir(): Promise<string> {
    const home = await homeDir();
    return `${home}/.otools/local/otools-rscode`;
}

export async function clipboardWriteText(args: Args): Promise<void> {
    const text = String(args.text ?? '');
    try { await navigator.clipboard.writeText(text); } catch { /* best effort */ }
}

export async function noop(): Promise<null> { return null; }
export async function emptyArray(): Promise<unknown[]> { return []; }
export async function emptyObject(): Promise<Record<string, unknown>> { return {}; }
export async function falseValue(): Promise<boolean> { return false; }
export async function trueValue(): Promise<boolean> { return true; }
export async function zero(): Promise<number> { return 0; }
