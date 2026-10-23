# Release 2.122.1 — Readable shared dialogs

Shared dialog paragraphs used a fixed green color that did not follow the active theme. Folder previews consequently showed their scope, deletion explanation and backup note at 4.22:1 contrast in dark mode and 3.62:1 in light mode.

The base paragraph rule now uses the theme's muted text token, with a readable fallback. Contrast is 8.62:1 in dark mode and 5.67:1 in light mode. The shared dialog frame is borderless with a 16px corner radius; keyboard focus outlines remain visible.

The browser display regression now checks computed paragraph contrast of at least 4.5:1 and zero dialog borders in both themes. Existing theme/system preference, density, text size, paired panes, focus restoration and mobile width checks pass. Light and dark screenshots were inspected.

Both packaged Mac architectures pass computed contrast/border assertions in light and dark themes and the full native mirror workflow. Packaged screenshots were inspected. All three ZIPs pass integrity checks; versions and final renderer/CSS assets match source. Download sizes, SHA-256 and Windows browser download pass; shipped branding search is clear. No comparison-engine changes were made in this release. Windows runtime and full-product scope remain open.
