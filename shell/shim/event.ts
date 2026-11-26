/** Minimal in-page Tauri event bus. No native event source exists in a plugin webview. */
type Listener = (event: { event: string; payload: any; id: number }) => void;

const listeners = new Map<string, Map<number, Listener>>();
let nextId = 1;

export type UnlistenFn = () => void;

export async function listen<T = unknown>(event: string, handler: (e: { event: string; payload: T }) => void): Promise<UnlistenFn> {
    let bucket = listeners.get(event);
    if (!bucket) {
        bucket = new Map();
        listeners.set(event, bucket);
    }
    const id = nextId++;
    bucket.set(id, handler as Listener);
    return () => {
        const current = listeners.get(event);
        current?.delete(id);
        if (current && current.size === 0) listeners.delete(event);
    };
}

export async function once<T = unknown>(event: string, handler: (e: { event: string; payload: T }) => void): Promise<UnlistenFn> {
    const off = await listen<T>(event, (e) => { off(); handler(e); });
    return off;
}

export async function emit(event: string, payload?: unknown): Promise<void> {
    emitLocal(event, payload);
}

export function emitLocal(event: string, payload?: unknown): void {
    const bucket = listeners.get(event);
    if (!bucket) return;
    for (const handler of [...bucket.values()]) {
        try { handler({ event, payload, id: 0 }); } catch { /* listener fault must not break the emitter */ }
    }
}
