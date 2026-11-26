/**
 * Tauri `fs` / `search` commands backed by the OTools host filesystem.
 * Upstream SideX expects Rust-shaped JSON; the workbench itself is unchanged.
 */
import { getBackend } from '../host';
import { hostCommand, hostLog } from '../hostCommand';
import { basename, joinPath, normalizePath } from '../util';

type Args = Record<string, any>;

const notFound = (path: string): never => {
    throw `${path}: No such file or directory (os error 2)`;
};

async function bytesOf(path: string): Promise<Uint8Array> {
    const file = await getBackend().readFile(path);
    if (!file) notFound(path);
    return file!.bytes;
}

const textOf = async (path: string): Promise<string> => new TextDecoder().decode(await bytesOf(path));

export async function readFile(args: Args): Promise<string> {
    return textOf(String(args.path ?? ''));
}

export async function readFileBytes(args: Args): Promise<number[]> {
    return Array.from(await bytesOf(String(args.path ?? '')));
}

export async function writeFile(args: Args): Promise<void> {
    await getBackend().writeFile(String(args.path ?? ''), new TextEncoder().encode(String(args.content ?? '')));
}

export async function writeFileBytes(args: Args): Promise<void> {
    const content = Array.isArray(args.content) ? args.content : [];
    await getBackend().writeFile(String(args.path ?? ''), new Uint8Array(content));
}

export async function readDir(args: Args): Promise<unknown[]> {
    const entries = await getBackend().listDir(String(args.path ?? ''));
    return entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        is_dir: entry.isDirectory,
        is_file: !entry.isDirectory,
        is_symlink: Boolean(entry.isSymlink),
        size: entry.size,
        modified: entry.modified,
    }));
}

export async function stat(args: Args): Promise<unknown> {
    const path = String(args.path ?? '');
    try {
        const entries = await getBackend().listDir(path);
        return {
            size: entries.length,
            is_dir: true,
            is_file: false,
            is_symlink: false,
            modified: Math.floor(Date.now() / 1000),
            created: Math.floor(Date.now() / 1000),
            readonly: false,
        };
    } catch {
        /* treat as file below */
    }
    const file = await getBackend().readFile(path);
    if (!file) notFound(path);
    return {
        size: file!.size,
        is_dir: false,
        is_file: true,
        is_symlink: false,
        modified: Math.floor(file!.modified / 1000) || Math.floor(Date.now() / 1000),
        created: Math.floor(file!.modified / 1000) || Math.floor(Date.now() / 1000),
        readonly: false,
    };
}

export async function exists(args: Args): Promise<boolean> {
    const path = String(args.path ?? '');
    try {
        const file = await getBackend().readFile(path);
        if (file) return true;
    } catch { /* ignore */ }
    try {
        await getBackend().listDir(path);
        return true;
    } catch { return false; }
}

export async function mkdir(args: Args): Promise<void> {
    const path = String(args.path ?? '');
    try {
        await hostCommand('tools_webview_create_dir', { path });
    } catch (error) {
        hostLog(`create_dir failed: ${path} ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function remove(args: Args): Promise<void> {
    await hostCommand('tools_webview_remove_entry', {
        path: String(args.path ?? ''),
        recursive: Boolean(args.recursive),
    });
}

export async function rename(args: Args): Promise<void> {
    await hostCommand('tools_webview_rename_entry', {
        request: { from: String(args.oldPath ?? ''), to: String(args.newPath ?? '') },
    });
}

let watchSeq = 0;
export async function watchStart(_args: Args): Promise<number> {
    watchSeq += 1;
    return watchSeq;
}
export async function watchStop(_args: Args): Promise<void> {
    // The OTools host has no file-watcher bridge; writes through this editor
    // already invalidate the VS Code model through the workbench itself.
}

function matchesPattern(name: string, pattern: string): boolean {
    if (!pattern) return true;
    if (pattern.includes('*') || pattern.includes('?')) {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
        return new RegExp(`^${escaped}$`, 'i').test(name);
    }
    return name.toLowerCase().includes(pattern.toLowerCase());
}

async function walk(root: string, includeHidden = false, limit = 4000): Promise<Array<{ path: string; name: string }>> {
    const out: Array<{ path: string; name: string }> = [];
    const queue = [normalizePath(root)];
    while (queue.length && out.length < limit) {
        const dir = queue.shift()!;
        let entries: Awaited<ReturnType<ReturnType<typeof getBackend>['listDir']>> = [];
        try { entries = await getBackend().listDir(dir); } catch { continue; }
        for (const entry of entries) {
            if (out.length >= limit) break;
            if (!includeHidden && entry.name.startsWith('.')) continue;
            if (entry.isDirectory) queue.push(entry.path);
            else out.push({ path: entry.path, name: entry.name });
        }
    }
    return out;
}

export async function searchFiles(args: Args): Promise<unknown[]> {
    const root = String(args.root ?? '');
    const pattern = String(args.pattern ?? '');
    const options = args.options ?? {};
    const include: string[] = Array.isArray(options.include) ? options.include : [];
    const exclude: string[] = Array.isArray(options.exclude) ? options.exclude : [];
    const max = Number(options.max_results ?? 200);
    const files = await walk(root, Boolean(options.include_hidden));
    const result: Array<{ path: string; name: string; score: number }> = [];
    for (const file of files) {
        if (exclude.some((item) => file.path.includes(item.replace(/\*/g, '')))) continue;
        if (include.length && !include.some((item) => matchesPattern(file.name, item))) continue;
        if (!matchesPattern(file.name, pattern)) continue;
        result.push({ path: file.path, name: file.name, score: 1 });
        if (result.length >= max) break;
    }
    return result;
}

export async function searchText(args: Args): Promise<unknown[]> {
    const root = String(args.root ?? '');
    const query = String(args.query ?? '');
    const options = args.options ?? {};
    if (!query) return [];
    const max = Number(options.max_results ?? 500);
    const maxSize = Number(options.max_file_size ?? 2 * 1024 * 1024);
    const caseSensitive = Boolean(options.case_sensitive);
    const isRegex = Boolean(options.is_regex);
    let matcher: (line: string) => { column: number; length: number } | null;
    try {
        const needle = caseSensitive ? query : query.toLowerCase();
        const regex = isRegex ? new RegExp(query, caseSensitive ? 'g' : 'gi') : null;
        matcher = (line) => {
            const haystack = caseSensitive ? line : line.toLowerCase();
            const column = regex ? (line.search(regex) >= 0 ? line.search(regex) : -1) : haystack.indexOf(needle);
            return column >= 0 ? { column, length: query.length } : null;
        };
    } catch {
        return [];
    }
    const files = await walk(root, Boolean(options.include_hidden));
    const result: unknown[] = [];
    for (const file of files) {
        if (result.length >= max) break;
        const stat = await getBackend().readFile(file.path);
        if (!stat || stat.size > maxSize) continue;
        const lines = new TextDecoder().decode(stat.bytes).split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            const match = matcher(lines[index]);
            if (!match) continue;
            result.push({
                path: file.path,
                line_number: index + 1,
                line_content: lines[index],
                column: match.column,
                match_length: match.length,
            });
            if (result.length >= max) break;
        }
    }
    return result;
}

export async function getCwd(): Promise<string> {
    return '/';
}

export async function openExternalUrl(args: Args): Promise<void> {
    getBackend().openExternal(String(args.url ?? ''));
}
