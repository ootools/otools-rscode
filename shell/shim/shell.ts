/** `@tauri-apps/plugin-shell` replacement for external links. */
import { getBackend } from './host';

export async function open(url: string): Promise<void> {
    getBackend().openExternal(String(url));
}
