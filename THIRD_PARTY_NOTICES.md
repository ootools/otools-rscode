# Third-party notices

This plugin is a port of [SideX](https://github.com/Sidenai/sidex) by Sidenai,
licensed under the **MIT License**. SideX ports the Visual Studio Code workbench
(Code - OSS, MIT) to Tauri. The pinned upstream commit is recorded in
`upstream.lock.json`; its `LICENSE` is included verbatim in this repository and
in every `.oplg` release package.

## What is reused

- `upstream/src/`, `upstream/public/` and `upstream/scripts/` — an unmodified
  whitelist snapshot of the upstream frontend and its build helpers at the
  pinned commit. All port-specific changes live in `shell/` and are layered onto
  the build tree by `scripts/tree.mjs`.
- The VS Code workbench, Monaco Editor and codicon assets retain their original
  MIT / SIL licenses.

## Runtime dependencies

Dependencies are declared in `package.json`; their licenses ship inside their
respective npm packages. The Rust, Go and native extension-host parts of SideX
are intentionally not included in this plugin.
