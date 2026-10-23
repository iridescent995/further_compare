# Explorer visual asset staging

Run `node scripts/build-explorer-assets.cjs` from the repository. This stages only artwork under `build/explorer-assets`; it does not build, sign, register or install a Windows package. An optional first argument selects a dedicated destination whose parent already exists.

The source is the existing `build/icon.png` artwork (originally produced from `public/icon.svg` by `scripts/icon.cjs`). The generator validates bounded 8-bit RGBA PNG input, performs premultiplied-alpha area resampling, emits transparent PNGs, and records source/output SHA-256 hashes in `assets.json`. There are no timestamps or random bytes in outputs. Repeated generation is byte-identical with the same Node/zlib toolchain; compression byte identity across different zlib releases is not promised.

Outputs include the manifest's exact base filenames: `Assets/StoreLogo.png` (50 px), `Assets/Square44x44Logo.png` (44 px) and `Assets/Square150x150Logo.png` (150 px), plus 100%, 200% and 400% scale variants. `FurtherCompareExplorer.ico` contains independently rasterized 16, 20, 24, 32, 40, 48, 64 and 256 px PNG frames. These cover common context-menu scale sizes; the existing application ICO is not overwritten.

A new output directory is created exclusively. Existing output is accepted only when its entire file inventory and every byte exactly match the generated set. Foreign files, differing files, symlink destinations and symlink parent paths are refused without replacement. An interrupted partial staging directory is deliberately not automatically erased or repaired. Use a fresh dedicated destination, or inspect/remove only the obsolete generated directory yourself.

## Optional Windows SDK wiring

Pass `-DFC_EXPLORER_ASSETS_DIR=<absolute generated directory>` to the existing Windows CMake configuration. CMake requires the base assets and ICO, configures `ExplorerIcon.rc.in` with an absolute ICO path, embeds icon resource 101, and copies the generated `Assets` directory beside the generated package manifest. Without this explicit option, the earlier scaffold behavior remains unchanged. The standalone generated `ExplorerIcon.rc` uses a relative filename and is intended only for compilation from its own staging directory.

`GetIcon` still returns `E_NOTIMPL` in this change. Returning the newly embedded resource, native resource extraction, COM ABI correctness, MakeAppx packaging, signatures and actual Explorer icon/theme rendering still require Windows SDK/runtime acceptance. No signed release identity or activation authority is fabricated by generating artwork.

Microsoft documents the [resource-string format for GetIcon](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-iexplorercommand-geticon), [ICO resource declaration and absolute-path requirement](https://learn.microsoft.com/en-us/windows/win32/menurc/icon-resource), and [context-menu and manifest icon sizes](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction). `test/explorer-assets.test.cjs` verifies deterministic bytes, manifest filename coverage, decoded PNG dimensions/transparency, every ICO frame's offsets and dimensions, corrupted-input refusal, and safe idempotent staging on macOS. These checks do not replace Windows resource compilation or visual acceptance.
