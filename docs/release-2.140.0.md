# Release 2.140.0 — Picture context actions

Picture Compare exposes opening either image, saving the difference PNG, view modes, zoom levels, tolerance and opacity settings through a keyboard-accessible right-click menu. Escape restores focus, native input context menus remain available, and menus and submenus stay within the viewport in both themes. Captured actions are invalidated when comparison state changes.

Image replacement disables exporting the previous result. Cancelling the picker recomputes the retained inputs. Changing tolerance immediately invalidates the old result before the debounced comparison starts, preventing an export with outdated settings. New comparisons invalidate earlier asynchronous results.

Source browser and native Mac workflows pass, including exact exported RGBA pixels, unchanged source bytes, pending picker cancellation, stale callbacks, settings, keyboard submenus and focus. Existing picture comparison and audio context regressions pass. Both final Mac packages passed the native picture workflow. All three ZIP integrity checks, packaged version and final UI asset comparisons, download links/sizes/SHA-256 and Windows ZIP browser download passed. Shipped branding checks found no matches. Actual Windows runtime and remaining full-product scope are outstanding.
