/**
 * `@tauri-apps/api/window` replacement. The OTools host owns the real panel,
 * so window management verbs are intentionally no-ops (except fullscreen,
 * which maps to the browser Fullscreen API).
 */
type Win = {
    label: string;
    startDragging: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    isFullscreen: () => Promise<boolean>;
    setFullscreen: (value: boolean) => Promise<void>;
    setTitle: (title: string) => Promise<void>;
    onCloseRequested: () => Promise<() => void>;
};

let current: Win | null = null;

export function getCurrentWindow(): Win {
    if (current) return current;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    current = {
        label: 'main',
        startDragging: async () => { /* host panel owns dragging */ },
        toggleMaximize: async () => { /* host panel owns layout */ },
        minimize: async () => { /* host panel owns layout */ },
        maximize: async () => { /* host panel owns layout */ },
        close: async () => { /* host panel owns lifecycle */ },
        isMaximized: async () => false,
        isFullscreen: async () => Boolean(document.fullscreenElement || doc.webkitFullscreenElement),
        setFullscreen: async (value: boolean) => {
            try {
                if (value) await document.documentElement.requestFullscreen();
                else if (document.fullscreenElement) await document.exitFullscreen();
            } catch { /* fullscreen is best effort in a webview */ }
        },
        setTitle: async (title: string) => { document.title = title; },
        onCloseRequested: async () => () => { /* no native close-request events in webview */ },
    };
    return current;
}

export const WebviewWindow = { getCurrentWindow };
export const getCurrentWebviewWindow = getCurrentWindow;
