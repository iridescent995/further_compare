# Explorer COM implementation foundation

**Source implementation only. This DLL has not been compiled against the Windows SDK or run in Explorer. It is not registered or enabled by Further Compare.** Existing classic registry menus are unchanged. Windows runtime validation remains deferred by the user.

`ExplorerCommand.cpp` implements the real IExplorerCommand ABI, root flyout and three child commands, IEnumExplorerCommand enumeration/clone, IClassFactory activation, aggregation refusal, reference counts, server locks, and DllGetClassObject/DllCanUnloadNow exports. The `.def` preserves export names. No DllRegisterServer or registration action exists.

Menu construction uses the supplied IShellItemArray's count and SFGAO_FILESYSTEM/FOLDER/STREAM metadata, at most two items. It performs no directory/content enumeration, network requests or stat calls. Filesystem ZIP containers may have both FOLDER and STREAM; they are treated as files. Virtual items and mixed file/folder pairs are disabled. Compare with Left reads only an optional bounded local REG_BINARY display hint. Missing/malformed hints use the generic label and unknown eligibility; valid unavailable or wrong-kind hints disable that command. GetState returns E_PENDING for hint-dependent state when fOkToBeSlow is false; only a permitted slow call reads the registry. GetTitle performs one bounded local hint read. The host resolves and validates authoritative state. Deterministic icon asset staging and optional resource embedding now exist. Guarded lifecycle service and setup UI source also exist; production enablement remains unavailable until native SDK compilation, signing/deployment and Windows acceptance establish the required authority.

Invoke captures a bounded deep copy of exact filesystem paths from its own supplied selection array, constructs the existing --fc-* flags through SelectionPolicy.hpp, and calls CreateProcessW with an explicit lpApplicationName, tested Windows argument quoting and no shell interpolation. The host still checks current filesystem kind/identity, remembered state and pair order. Menu state is never authorization to read or mutate file contents.

## Fixed installed host contract

The future owned installer must place `FurtherCompareExplorer.dll` directly beside `Further Compare.exe`, then explicitly configure the current user's `HKCU\Software\FurtherCompare\Explorer` **Executable** REG_SZ to that exact absolute local-drive executable path. Invoke fails if missing, invalid, expanded, oversized, changed while reading, or not the sibling of the currently loaded DLL. It never chooses another installed copy or default protocol handler. This is fixed-containing-install targeting, not publisher/signature attestation. A separate guarded mutation transport contains the owned configuration writer; this native foundation does not invoke it, and the default production integration remains read-only. No registry modification is performed automatically.

## Reproducible Windows SDK build

Prerequisites: Visual Studio 2022 C++ tools, Windows 10/11 SDK and CMake >=3.24 on Windows. Use a Developer PowerShell:

```powershell
cmake -S desktop/native/explorer -B build/explorer-x64 -G "Visual Studio 17 2022" -A x64 -DBUILD_TESTING=ON
cmake --build build/explorer-x64 --config Release
ctest --test-dir build/explorer-x64 -C Release --output-on-failure
dumpbin /exports build/explorer-x64/Release/FurtherCompareExplorer.dll
```

Select `-A ARM64` into a separate build directory for native ARM64 Explorer. Do not use an x64 extension to claim ARM64 compatibility. COM contract tests load only the built DLL and exercise factory/enumerator/reference ownership, labels and fake Shell selection metadata (single/pairs, mixed/virtual/ZIP, zero/oversized counts and failing Shell calls); they do not configure a host or launch/register the app. The fake-item methods assert if menu-state evaluation requests a display path, binds a handler or enumerates contents. A separate denied-path Invoke case checks exactly one count/item/path fetch and E_ACCESSDENIED for each child command, stopping before configured-host lookup. Invocation captures metadata and path from the same retained Shell item; successful-null items are rejected in both state and capture paths. Compare-with-left fast calls assert E_PENDING without requiring machine-specific registry state. These expanded SDK tests are authored but still await Windows compilation/execution. Static CRT linkage is intentional; DllMain does not disable CRT thread notifications.

## Manifest scaffold and unfinished deployment

`Package.appxmanifest.in` declares sparse package external content, the COM surrogate and file/folder verbs using the same root CLSID. CMake generates `Package.appxmanifest` only with explicit `FC_PACKAGE_NAME` and certificate-matching `FC_PACKAGE_PUBLISHER`; it does not invent a production identity. Version is supplied by `FC_PACKAGE_VERSION` and architecture derives from the build target. Required StoreLogo/Square150x150Logo/Square44x44Logo PNGs and a multiframe ICO can now be staged with `node scripts/build-explorer-assets.cjs`. Pass `-DFC_EXPLORER_ASSETS_DIR=<absolute build/explorer-assets>` to opt into resource 101 embedding and copying the PNG assets. See `docs/windows-explorer-assets.md` for verification and remaining Windows SDK gates. GetIcon remains unchanged.

This scaffold still needs Windows SDK manifest validation, real logo assets, identity/certificate selection, signed sparse-package generation, owned installation/status/repair/uninstall with post-mutation inspection, upgrade/location conflict handling, and runtime acceptance. No CMake target installs a package or modifies Explorer. Build success is not proof of menu placement, callback responsiveness, path/provider behavior, or successful Electron launch.

## References

- [Microsoft IExplorerCommand contract](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-iexplorercommand): callbacks must not communicate with network resources.
- [Microsoft modern Explorer integration](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/integrate-packaged-app-with-file-explorer): COM DLL, app identity and manifest registration.
- [Microsoft SFGAO flags](https://learn.microsoft.com/en-us/windows/win32/shell/sfgao): filesystem folders versus files that are also browsable containers.

## Advisory filename hint

`LeftHint.hpp` decodes the current user Explorer key's `LeftHint` REG_BINARY: ASCII FCLH, uint16LE version1, byte kind (0 none /1 file /2 folder), byte available (0/1), uint16LE UTF-16 unit count <=96, exact UTF-16LE name (max202 bytes total). Kind0 requires unavailable and empty. Invalid lengths, encoding, C0/C1 controls, line separators and bidi formatting marks are rejected as unknown. Title formatting doubles ampersands for Windows menus. No path is read or transported by this hint. It may be stale by invocation; host state remains authoritative.
