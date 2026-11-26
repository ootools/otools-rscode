# otools-rscode

把 [SideX](https://github.com/Sidenai/sidex) 移植成 **OTools 独立插件**：保留上游的 VS Code workbench / Monaco 前端，把 Tauri v2 的 Rust 后端换成 OTools 宿主 webview API。纯前端、无 Rust cdylib、无 Go agent、无账号体系。

- 上游：`Sidenai/sidex` @ `ad978652682270a593e7029269beff5411477a70`（MIT）
- 插件：`otools-rscode`，版本见 `plugin.json`
- 宿主要求：OTools ≥ 0.9.0

## 目录结构

- `upstream/`：锁定提交的前端白名单快照（`src/`、`public/`、`scripts/`），**只读**；哈希见 `upstream.lock.json`。
- `shell/`：全部移植代码。`shim/` 把 `@tauri-apps/api/{core,event,window}`、`plugin-dialog`、`plugin-shell` 指向 OTools 宿主；`src/main.ts` 在启动前注入桥；`src/vs/sidex-bridge.ts` 覆盖上游本地 IPC。
- `scripts/tree.mjs`：把 upstream + shell 合成 `.build/`，再交给 `vite build` 产出 `dist/`。
- `dist/`、`dist-pack/` 是构建产物，不进 git。

## 可用能力与降级项

| 上游能力 | 插件版实现 |
| --- | --- |
| 打开文件夹 / 打开文件 / 另存为 | 宿主 SDK 页面内 DOM 树 `pickFromHostTree`，返回本机真实路径 |
| 文件读写、目录树、stat、exists | 宿主文件 API（`readHostFile` / `writeHostFile` / `listHostDir`）与 `tools_webview_*` 命令 |
| 文件名搜索、全文搜索 | shim 内递归遍历宿主文件树实现 |
| 设置、密钥、存储 | 宿主文件 `~/.otools/local/otools-rscode/kv-*.json`，浏览器预览回退 IndexedDB/localStorage |
| 多标签、Monaco 编辑、主题、命令面板 | 上游 workbench 原样运行 |
| 终端 PTY、LSP/DAP、扩展宿主、Git、本地 AI Agent、原生菜单 / 多窗口 | 依赖 Rust/Go 进程或 OS 原生窗口，插件版降级为空结果 |

## 开发

```bash
npm install --legacy-peer-deps   # 本机 pnpm install 报 ERR_PNPM_EIO，暂用 npm
npm run check-upstream           # 校验上游快照哈希
npm run build                    # 合成 .build/ + vite build → dist/
npm run pack                     # 六平台 .oplg + 校验
```

本地验证：把 `dist/` rsync 到 `~/.otools/plugins/otools-rscode/dist/` 后重启宿主。诊断日志在 `~/.otools/log/core/webview.log`，筛选 `[rscode]`。

## 许可

SideX 与 VS Code 均为 MIT；见 `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md`。
