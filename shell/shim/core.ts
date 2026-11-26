/**
 * Drop-in `@tauri-apps/api/core` implementation for the SideX workbench.
 *
 * SideX's Rust backend owns 384 commands. This shim implements the ones the
 * editor needs to open folders, edit files, search text and persist settings;
 * everything else resolves to a harmless empty value so the workbench boots
 * inside the OTools webview without a native cdylib.
 */
import * as fs from './backend/fs';
import * as state from './backend/state';
import * as compat from './backend/compat';

type Handler = (args: Record<string, any>) => unknown | Promise<unknown>;

const unsupported = (command: string): Handler => (args) => compat.safeEmpty(command, args);

const handlers: Record<string, Handler> = {
    // Filesystem & search
    get_cwd: fs.getCwd,
    read_file: fs.readFile,
    read_file_bytes: fs.readFileBytes,
    write_file: fs.writeFile,
    write_file_bytes: fs.writeFileBytes,
    read_dir: fs.readDir,
    stat: fs.stat,
    mkdir: fs.mkdir,
    remove: fs.remove,
    rename: fs.rename,
    exists: fs.exists,
    watch_start: fs.watchStart,
    watch_stop: fs.watchStop,
    search_files: fs.searchFiles,
    search_text: fs.searchText,
    open_external_url: fs.openExternalUrl,

    // Settings, secrets, state and system metadata
    settings_get: state.settingsGet,
    settings_update: state.settingsUpdate,
    settings_load: state.settingsLoad,
    secret_get: state.secretGet,
    secret_set: state.secretSet,
    secret_delete: state.secretDelete,
    secret_keys: state.secretKeys,
    storage_set: state.storageSet,
    storage_delete: state.storageDelete,
    get_env: state.getEnv,
    get_all_env: state.getAllEnv,
    get_os_info: state.getOsInfo,
    get_user_data_dir: state.getUserDataDir,
    clipboard_write_text: state.clipboardWriteText,
    get_default_shell: compat.defaultShell,
    get_available_shells: compat.availableShells,
    check_shell_exists: compat.shellExists,
    server_endpoint: compat.serverEndpoint,
    server_restart: compat.serverRestart,

    // Native-only subsystems
    git_is_repo: compat.gitIsRepo,
    git_status: compat.gitStatus,
    git_branches: compat.gitBranches,
    git_log: compat.gitLog,
    git_diff: compat.gitDiff,
    theme_list: compat.themeList,
    theme_get: compat.themeGet,
    theme_get_default_dark: compat.themeGet,
    theme_get_default_light: compat.themeGet,
    syntax_get_languages: compat.syntaxLanguages,
    syntax_detect_language: compat.syntaxDetect,
    syntax_detect_from_content: compat.syntaxDetect,
    syntax_get_language_config: compat.syntaxLanguageConfig,
    textmate_load_grammar: unsupported('textmate_load_grammar'),
    textmate_release_stack: unsupported('textmate_release_stack'),
    textmate_tokenize_line: compat.textmateTokens,
    textmate_tokenize_line_binary: compat.textmateTokens,
    textmate_tokenize_document: compat.textmateTokens,
    textmate_update_theme: unsupported('textmate_update_theme'),
    syntax_tokenize: compat.textmateTokens,
    extension_runtime_status: compat.extensionStatus,
    extension_platform_status: compat.extensionStatus,
    extension_platform_bootstrap: compat.extensionBootstrap,
    extension_platform_init_data: compat.extensionBootstrap,
    list_installed_extensions: compat.extensionList,
    wasm_list_extensions: compat.extensionList,
    update_state: compat.updateState,
    update_check: compat.updateCheck,
    update_download: compat.updateState,
    update_apply: compat.updateState,
    update_quit_and_install: compat.updateState,
    terminal_spawn: compat.terminalSpawn,
    terminal_write: compat.terminalWrite,
    terminal_kill: compat.terminalKill,
    terminal_resize: compat.terminalResize,
    terminal_get_pid: state.zero,

    // Commands owned by the OTools host / native shell
    save_window_state: state.noop,
    update_menu_labels: state.noop,
    open_url_in_browser: fs.openExternalUrl,
};

const warned = new Set<string>();

export async function invoke<T = unknown>(command: string, payload: Record<string, any> = {}): Promise<T> {
    const handler = handlers[command];
    if (!handler) {
        if (!warned.has(command)) {
            warned.add(command);
            compat.safeEmpty(command, payload);
        }
        return undefined as T;
    }
    try {
        return await handler(payload ?? {}) as T;
    } catch (error) {
        // Tauri rejects with a plain string; upstream reads `error as string`.
        if (error instanceof Error) throw error.message;
        throw error;
    }
}

export const convertFileSrc = (path: string): string => path;
export const isTauri = (): boolean => true;
export const transformCallback = (_callback: unknown, _once = false): number => 0;

/** Used by the event shim to fan out workbench-local notifications. */
export { emitLocal } from './event';
