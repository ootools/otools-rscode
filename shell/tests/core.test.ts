import { describe, expect, it } from 'vitest';
import { invoke } from '../shim/core';
import { setBackend, type HostBackend, type HostDirEntry } from '../shim/host';

const files = new Map<string, Uint8Array>();
const dirs = new Set<string>(['/']);

const backend: HostBackend = {
    async readFile(path) {
        const bytes = files.get(path);
        if (!bytes) return null;
        const name = path.split('/').pop() || path;
        return { path, name, size: bytes.length, modified: 1, bytes };
    },
    async writeFile(path, bytes) {
        files.set(path, bytes.slice());
        dirs.add(path.slice(0, path.lastIndexOf('/')) || '/');
    },
    async listDir(path): Promise<HostDirEntry[]> {
        if (!dirs.has(path)) throw new Error(`Not a directory: ${path}`);
        const prefix = path === '/' ? '/' : `${path}/`;
        const seen = new Map<string, HostDirEntry>();
        for (const file of files.keys()) {
            if (!file.startsWith(prefix)) continue;
            const rest = file.slice(prefix.length);
            if (rest.includes('/')) continue;
            seen.set(file, { name: rest, path: file, isDirectory: false, size: files.get(file)!.length, modified: 1 });
        }
        return [...seen.values()];
    },
    async pickFile() { return null; },
    async pickFolder() { return null; },
    async pickSave() { return null; },
    async confirm() { return true; },
    async message() { /* no-op */ },
    openExternal() { /* no-op */ },
    async readClipboard() { return ''; },
    async writeClipboard() { /* no-op */ },
};

describe('OTools SideX command shim', () => {
    it('round-trips UTF-8 files through the host backend', async () => {
        setBackend(backend);
        await invoke('write_file', { path: '/src/hello.ts', content: 'export const ok = true;' });
        expect(await invoke('read_file', { path: '/src/hello.ts' })).toBe('export const ok = true;');
        const stat = await invoke<any>('stat', { path: '/src/hello.ts' });
        expect(stat.is_file).toBe(true);
        expect(stat.size).toBe(23);
    });

    it('returns safe defaults for native-only commands', async () => {
        expect(await invoke('git_is_repo')).toBe(false);
        expect(await invoke('theme_list')).toEqual([]);
        expect(await invoke('update_check')).toMatchObject({ available: false });
    });
});
