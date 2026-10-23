# Folder workflow acceptance audit — 2.62.2

Audit date: 21 October 2026. Tests executed against the current source-built Electron app on macOS. These results establish the behaviors below, not full product parity or Windows runtime support.

| Requested behavior | Current evidence | Result |
| --- | --- | --- |
| Compact folder comparison | folder-selection-desktop checks real 23px row height and three columns in both panes | Passed |
| Colors; name, size and last modified only | folder-selection-desktop asserts exact column labels; folder-live-colors-desktop checks content provenance and live status updates; folder-parent-status-desktop checks both appearances | Passed |
| Compare files in the opened node only | folder-node-refresh-desktop observes immediate-node IPC without unrelated reads; folder-compare-queue-desktop checks settled siblings, collapsed nodes and in-flight expansion | Passed |
| Clicking selects | folder-selection-desktop asserts selected rows without creating a comparison tab | Passed |
| Right-click options | folder-context-menu-desktop checks the implemented action inventory, keyboard access, disabled items, focus restoration, multi-selection and submenu placement | Implemented inventory passed; reference menu completeness unverified |
| No checkboxes; Ctrl/Command selection | folder-selection-desktop asserts no checkboxes and tests the host platform modifier, toggles, ranges and focus-only navigation | Passed on Mac; Windows runtime still pending |
| Double click opens comparison | folder-selection-desktop and folder-tree-ui-desktop verify actual file contents and return to the preserved folder tab | Passed |
| Inline folder tree | folder-tree-ui-desktop verifies cross-parent alignment, independent names and parent return; node refresh test verifies no extra tab | Passed |
| No reference-product branding in app | Case-insensitive scan of src, desktop, public (excluding downloads/maps), compare.html, index.html and style.css returned no matches | Passed for scanned source/UI assets |

All seven invoked native test programs completed successfully in this audit. Browser and both packaged Mac display checks were also completed for release 2.62.2 in the preceding theme update.

Direct reference-app inspection was attempted using the installed application path. Computer-use returned that the Mac was locked and automatic unlock failed. The earlier unlock request remains pending. Menu parity cannot be inferred from tests that enumerate only our implemented actions.

## Broader scope remains open

The user expanded the request to the full comparison product. The implementation plan still records incomplete remote folder support, archive editing and additional formats, legacy workbook inputs, further workbook formatting/layout properties, compressed audio and metadata, live Windows registry operations, richer comparison rules, and other platform/workflow gaps. This audit does not close that scope. Windows packages are cross-built; native Windows behavior requires runtime verification.
