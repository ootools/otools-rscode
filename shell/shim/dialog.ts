/** `@tauri-apps/plugin-dialog` replacement backed by the SDK's in-page host tree. */
import { pickHostFile, pickHostFolder, pickHostSavePath } from './hostTree';

type Args = Record<string, any>;

export async function open(options: Args = {}): Promise<string | string[] | null> {
    const multiple = Boolean(options.multiple);
    const directory = Boolean(options.directory);
    if (multiple) {
        const first = directory ? await pickHostFolder(options.title ?? '选择文件夹') : await pickHostFile(options.title ?? '选择文件');
        return first ? [first] : null;
    }
    return directory ? pickHostFolder(options.title ?? '打开文件夹') : pickHostFile(options.title ?? '打开文件');
}

export async function save(options: Args = {}): Promise<string | null> {
    const suggested = String(options.defaultPath ?? '').replace(/\\/g, '/').split('/').pop() || 'untitled.txt';
    return pickHostSavePath(suggested);
}

export async function ask(message: string, options: Args = {}): Promise<boolean> {
    return window.confirm(`${options.title ? `${options.title}\n\n` : ''}${message}`);
}

export async function confirm(message: string, options: Args = {}): Promise<boolean> {
    return ask(message, options);
}

export async function message(message: string, options: Args = {}): Promise<void> {
    window.alert(`${options.title ? `${options.title}\n\n` : ''}${message}`);
}
