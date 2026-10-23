# Guarded Explorer mutation transport (source only)

`desktop/windows-explorer-mutation.cjs` exports `createWindowsExplorerMutation({inspect,helperSha256,systemRoot,platform,fs,execFile})`. Its `execute(step,context)` matches the existing lifecycle runner callback. `inspect(expected)` must be a trusted, fresh **authoritative snapshot provider**; the read-only evidence adapter cannot be passed here. No UI or classic Explorer integration calls this transport.

The transport verifies the immutable expected binding and entire observed snapshot digest, then regenerates the first mutation from allowed install, repair, or uninstall plans. The current runner context has no action; exact first-step equivalence is required, rather than assuming an action. The existing runner supplies durable journal ordering, fresh inspection after every attempted mutation, and actual postcondition checks. A successful process acknowledgment alone is not completion.

The transport reads only fixed packaged script sources, encodes them as base64, and sends a fixed PowerShell expression over stdin to `powershell.exe -Command -`. The request is JSON data, never executable text. No writable script staging or cleanup exists. Requests are bounded to 128 KiB, script sources to 64 KiB each, and combined process output to 8 KiB. The helper SHA-256 pin is mandatory trusted release configuration, never taken from registry metadata. There is no arbitrary executable path, pipeline package selection, or all-users operation. Only the fixed current-user `Software\FurtherCompare\Explorer` key and known ownership values may be changed; unrelated values and the key itself remain. A native 64-bit PowerShell process is required, with explicit Registry64 view, matching the existing collector's native 64-bit default view. A future collector changing view must coordinate this contract.

Registration holds read-only, no-write/no-delete-sharing handles on the executable, COM DLL, and package while rechecking SHA-256, Authenticode publisher, bounds, and reparse ancestry, and during `Add-AppxPackage`. Removal targets one exact owned full package name. No automatic rollback or process shutdown is requested.

## Evidence and remaining gates

Injected Node tests cover exact transport arguments, stale/forged/read-only input rejection, failures, cleanup, and real runner orchestration. They do **not** execute PowerShell, validate SDK deployment, prove registry semantics, or demonstrate a Windows Explorer menu. Windows runtime remains deferred.

Registry value updates and package deployment are not atomic. Another process can change state between observations; post-mutation inspection must report partial/conflicting state rather than success. Immediately before every mutation the script re-runs the fixed packaged inspector, rejecting direct CLSID entries and foreign package conflicts. For each registered package it invokes the existing signed, SHA-256-pinned SDK attestation helper and requires independently reported external location to match the inspected snapshot; removal additionally matches the exact step location. Embedded guard source hashes are checked before execution. The existing attestation wrapper holds the helper file while validating and invoking it. These native guards remain source-reviewed only until actual Windows acceptance. There is no mutation-capable production inspector wired yet, and no bypass from the read-only assessment.

PowerShell timeout or a lost acknowledgment may follow a completed system change; the runner always reinspects and reports uncertainty. Asset locks may affect Windows deployment compatibility and must be verified on Windows. Script execution policy, Authenticode trust, ARM64/native process selection, stdin PowerShell execution and package-in-use behavior remain real-machine acceptance cases. Native process timeout/termination and helper descendant cleanup also need Windows acceptance; a lost response never means rollback.

Microsoft references:

- [Packaging with an external location](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps) documents `Add-AppxPackage -Path -ExternalLocation`.
- [Add-AppxPackage](https://learn.microsoft.com/en-us/powershell/module/appx/add-appxpackage?view=windowsserver2025-ps) documents current-user deployment options.
- [Remove-AppxPackage](https://learn.microsoft.com/en-us/powershell/module/appx/remove-appxpackage?view=windowsserver2025-ps) documents exact package removal and distinct all-users options, which this transport does not use.

## Native command completion hardening

The Node transport force-terminates its command on timeout or bounded-output overflow. After the command exits in failure, it closes redirected streams instead of waiting for a descendant to release inherited pipes. Successful command exit alone is still insufficient: success requires the stream-close event and valid acknowledgment; inherited pipes that outlive the deadline produce failure. The lifecycle runner then reinspects and stops with a partial result. This does not claim descendant-tree cleanup or Windows deployment acceptance.

Real local Node subprocess tests cover complete output, stderr/stdout overflow, ignored SIGTERM, missing commands, nonzero exit, inherited-pipe failures, and deadline enforcement after successful parent exit. These exercise the transport on macOS, not PowerShell or Windows package deployment. Log: `/private/tmp/fc-explorer-process.log`.

A single kill-attempt guard prevents recursive termination attempts on a child error. If exit cannot be confirmed within the one-second grace period, the transport rejects with an explicit unconfirmed-termination error and suspends subsequent mutations for that adapter lifetime. It detaches process/stream handles without claiming that a surviving process was killed. Injected failure tests cover kill errors, exceptions and false results; a lifecycle test verifies no second mutation is launched.
