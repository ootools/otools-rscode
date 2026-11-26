/** Runs before the SideX workbench barrels are imported. */
import { invoke } from './core';
import { emitLocal } from './event';
import { hasHostCommandChannel, hostCommand, hostLog } from './hostCommand';
import { kvBackend } from './hostStore';

type BridgeWindow = Window & {
    __TAURI_INVOKE__?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    __TAURI__?: { core: { invoke: typeof invoke } };
    __SIDEX_OTools__?: boolean;
};

/** Ask the host for files handed over via "open with" before the workbench boots. */
async function restoreOpenedFile(): Promise<void> {
    if (!hasHostCommandChannel()) return;
    const pluginUuid =
        (globalThis as any).__OToolsEnv?.pluginUuid
        ?? new URLSearchParams(window.location.search).get('plugin')
        ?? 'otools-rscode';
    try {
        const files = await hostCommand<unknown>('otools_consume_open_files', { pluginUuid });
        if (!Array.isArray(files) || !files.length || typeof files[0] !== 'string') return;
        const picked = files[0].replace(/\\/g, '/');
        const cut = picked.lastIndexOf('/');
        const folder = cut > 0 ? picked.slice(0, cut) : picked;
        const url = new URL(window.location.href);
        if (!url.searchParams.get('folder')) url.searchParams.set('folder', `file://${folder}`);
        window.history.replaceState(null, '', url.toString());
    } catch { /* no pending file is the normal case */ }
}

export async function prepare(): Promise<void> {
    const win = window as BridgeWindow;
    win.__SIDEX_OTools__ = true;
    win.__TAURI_INVOKE__ = invoke as BridgeWindow['__TAURI_INVOKE__'];
    win.__TAURI__ = { core: { invoke } };

    // SideX chat listens on `__TAURI_INTERNALS__.event` when present. The host
    // supplies internals for app commands; never replace it (hostCommand needs it).
    const internals = (win as any).__TAURI_INTERNALS__;
    if (internals && !internals.event) {
        internals.event = { listen: (event: string, handler: (e: unknown) => void) => emitLocal(event, handler) };
    }

    await restoreOpenedFile();
    hostLog(`workbench starting (state backend: ${kvBackend()})`);
}
