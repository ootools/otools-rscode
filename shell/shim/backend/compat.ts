/**
 * Harmless fallbacks for Rust-only subsystems that cannot exist in a webview
 * plugin (terminal PTY, LSP/DAP, extension host, Go agent, native menus...).
 * The workbench features stay visible but degrade to empty state instead of
 * throwing during startup.
 */
import { hostLog } from '../hostCommand';

type Args = Record<string, any>;

const unsupported = (command: string): void => {
    hostLog(`未实现的后端能力：${command}（OTools webview 插件降级为空结果）`);
};

export async function safeEmpty(command: string, _args: Args = {}): Promise<unknown> {
    unsupported(command);
    return undefined;
}

export async function gitIsRepo(): Promise<boolean> { return false; }
export async function gitStatus(): Promise<unknown> { return { branch: '', changes: [] }; }
export async function gitBranches(): Promise<unknown[]> { return []; }
export async function gitLog(): Promise<unknown[]> { return []; }
export async function gitDiff(): Promise<string> { return ''; }

export async function themeList(): Promise<unknown[]> { return []; }
export async function themeGet(): Promise<unknown> { return null; }

export async function syntaxLanguages(): Promise<unknown[]> { return []; }
export async function syntaxDetect(): Promise<string> { return 'plaintext'; }
export async function syntaxLanguageConfig(): Promise<unknown> { return {}; }
export async function textmateTokens(): Promise<unknown[]> { return []; }

export async function extensionStatus(): Promise<unknown> { return { running: false, extensions: [] }; }
export async function extensionList(): Promise<unknown[]> { return []; }
export async function extensionBootstrap(): Promise<unknown> { return { ok: false }; }

export async function updateState(): Promise<unknown> { return { status: 'idle', version: '' }; }
export async function updateCheck(): Promise<unknown> { return { available: false }; }

export async function terminalSpawn(): Promise<unknown> { return { id: 0, pid: 0 }; }
export async function terminalWrite(): Promise<void> { /* no PTY in webview */ }
export async function terminalKill(): Promise<void> { /* no PTY in webview */ }
export async function terminalResize(): Promise<void> { /* no PTY in webview */ }

export async function defaultShell(): Promise<string> { return '/bin/zsh'; }
export async function availableShells(): Promise<unknown[]> {
    return [
        { name: 'zsh', path: '/bin/zsh', exists: true },
        { name: 'bash', path: '/bin/bash', exists: true },
    ];
}
export async function shellExists(): Promise<boolean> { return true; }

export async function serverEndpoint(): Promise<null> { return null; }
export async function serverRestart(): Promise<null> { return null; }
