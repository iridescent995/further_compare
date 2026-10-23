# Read-only Windows package attestation bridge

**Source only: not compiled with the Windows SDK or executed on Windows. Not packaged or wired into the app.** No registration, installation, registry mutation or activation APIs are used.

`FurtherComparePackageInspection package <absolute Explorer.msix> <trusted package name> <trusted publisher DN>`:

1. Opens the exact local package with a read-only handle that denies concurrent writes/deletion, rejects final reparse points and resolved path redirection, bounds compressed input to 16 MiB, and hashes the locked bytes with SHA-256.
2. Calls `WinVerifyTrust` with UI disabled and cache-only revocation policy, then independently compares the signer certificate's encoded subject to the trusted publisher DN. Uncached revocation/trust failure is a refusal, never a fallback to unsigned parsing.
3. Parses an in-memory snapshot of those same locked bytes using the Windows `IAppxFactory` reader, which validates package/manifest/block-map structure. Reads name, publisher, version, architecture, full name and family name through `IAppxManifestPackageId`; full/family identities are not synthesized.
4. Validates every mapped file using `IAppxBlockMapFile::ValidateFileHash`, requires the manifest to be mapped, and bounds the inventory to 512 files, 16 MiB per file and 64 MiB aggregate. This helper accepts only x64/ARM64 sparse deployment artifacts, not bundles.

Success returns JSON bound to the exact package path and SHA-256. In addition to generic Appx validity, `ProductManifest.hpp` checks the exact product binding using a bounded XmlLite tree: one fixed executable/application, mediumIL/win32App, external content enabled, one STA surrogate class at the fixed DLL/CLSID, exactly file and selected-folder verbs bound to that class, approved capabilities, Windows 11 minimum version and fixed logo paths present in the validated block map. Additional apps, executable arguments, COM registrations, arbitrary extensions/capabilities, alternate namespaces and path traversal are refused. `productManifestValidated:true` is emitted only after these checks.

The pure C++ policy is compiled and executed on macOS against 20 XML-derived manifest fixtures and missing-logo inventory checks. This tests the exact policy used by the Windows bridge, not a second JavaScript implementation. Windows XmlLite extraction and SDK signature/identity calls are still uncompiled/unexecuted here. Generic schema/identity attestation and product bindings are separate checks; neither proves separately deployed host/DLL signatures, actual PNG decoding, current registration or visible Explorer operation. The consumer must match separately verified host/DLL evidence before granting lifecycle authority. The PowerShell observation collector intentionally remains `verified:false`. The separate attestation wrapper now calls this helper under injected tests or eligible release-owned read-only configuration; combined evidence still does not grant mutation authority by itself.

`FurtherComparePackageInspection external-location <package full name>` queries `GetPackagePathByFullName2` with `PackagePathType_EffectiveExternal`. It reports the OS-resolved external path separately from package identity trust. It never substitutes `InstallLocation` for external content. Missing/unsupported APIs, absent packages, invalid paths and all failures return a nonzero exit and no verified result. This result must be combined with fresh current-user inventory and the signed full identity; location alone cannot attest ownership.

Build on Windows with Visual Studio 2022 and a current Windows SDK:

```
cmake -S desktop/native/explorer-inspection -B build/explorer-inspection -G "Visual Studio 17 2022" -A x64
cmake --build build/explorer-inspection --config Release
```

There is no install target or package mutation. Windows acceptance must cover a signed valid sparse package, modified payload/block map/manifest/signature, unexpected publisher/name, invalid schema, unsupported architecture, missing/aliased package, limits, offline certificate behavior and real external-location lookup. The attestation transport now invokes a fixed helper path under eligible read-only configuration (and through injected tests), validating the release-pinned helper hash/signature with bounded timeout/output. Production signed helper deployment and Windows acceptance remain unavailable, and hard process-memory limits remain an adapter requirement. Source scans do not establish that Windows APIs compiled or ran. The SDK may allocate memory while validating footprint parts before application-level file bounds; process resource limits therefore remain an adapter requirement.

Official API evidence:

- [CreatePackageReader](https://learn.microsoft.com/en-us/windows/win32/api/appxpackaging/nf-appxpackaging-iappxfactory-createpackagereader) validates package footprint/schema but explicitly does **not** validate digital signature.
- [ValidateFileHash](https://learn.microsoft.com/en-us/windows/win32/api/appxpackaging/nf-appxpackaging-iappxblockmapfile-validatefilehash) checks actual content against mapped hashes.
- [IAppxManifestPackageId](https://learn.microsoft.com/en-us/windows/win32/api/appxpackaging/nn-appxpackaging-iappxmanifestpackageid) supplies Windows-derived identity.
- [GetPackagePathByFullName2](https://learn.microsoft.com/en-us/windows/win32/api/appmodel/nf-appmodel-getpackagepathbyfullname2) and [PackagePathType](https://learn.microsoft.com/en-us/windows/win32/api/appmodel/ne-appmodel-packagepathtype) expose external package locations.
- [WinVerifyTrust](https://learn.microsoft.com/en-us/windows/win32/api/wintrust/nf-wintrust-winverifytrust) supplies signature/trust-provider verification, separate from Appx parsing.

## Local compiler discovery evidence

The available `/usr/bin/clang++` can compile the portable policy tests. A file inventory of the installed developer tools/SDKs, Applications, Library, `/opt`, `/usr/local`, and cached runtimes found Apple SDK compatibility headers but no Windows SDK `appxpackaging.h`, `appmodel.h`, XmlLite header or `kernel32.lib`. An actual `clang++ --target=x86_64-pc-windows-msvc -std=c++17 -fsyntax-only PackageInspection.cpp` attempt stops at missing `windows.h`. This is evidence about the discovered local toolchain, not a claim that searching PATH alone established Windows compilation impossibility. No toolchain was downloaded.
