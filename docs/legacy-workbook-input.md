# XLS and XLSB cached-value comparison

The source application now opens supported BIFF8 XLS and binary OOXML XLSB workbooks in Table Compare. Inputs work through direct opening, folder comparisons, shell requests, provider folders, archive entries and saved sessions. Released in 2.203.0; both Mac architectures passed packaged acceptance, and the Apple Silicon app is installed locally.

Sheets can be selected, matched by key columns and compared using stored cell values. Choose a side as the result to edit values, copy selected cached cells, undo or redo changes, and export CSV or a new values-only XLSX. Original workbook bytes remain embedded in sessions. Missing formula results are explicit unavailable cells and never compare equal; they cannot be copied or used as a complete result. Recalculate those workbooks in a spreadsheet application first.

Formula expressions, recalculation, formatting/layout comparison and source-preserving binary workbook editing are not implemented. A binary workbook cannot become an XLSX preservation template. An XLSX side in a mixed comparison can still be chosen as an XLSX template; copied binary formula caches become literal values. Archive writeback remains limited to supported CSV, TSV and XLSX entries.

## Validation and source protection

A pinned, checksum-verified SheetJS 0.20.3 archive is stored under `vendor/`, with the distributed license under `public/licenses/sheetjs`. It receives only bounded, derived streams from the XLS/XLSB preflight validators. Formula tokens and unrelated package metadata are excluded. The adapter reconciles sheet order, coordinates and cache types against the independent preflight census. Each parse uses a disposable worker with a deadline, and session replacement/reset cancels pending binary reads.

Native exports reject XLS/XLSB destination extensions and known source paths or inode aliases, including sources retained in other tabs/windows. Restored sessions do not grant path authority. Inspection of an independently selected existing destination protects renamed CFB and XLSB files using bounded reads without decompression. Ambiguous ZIP destinations are conservatively refused; recognizable ordinary XLSX remains eligible. Export to a separate file when refused.

Supported profiles and limits are specified in [XLS preflight](xls-preflight-profile.md) and [XLSB preflight](xlsb-preflight.md). Encryption, older BIFF profiles and unsupported records fail explicitly. Worker timeouts and allocation bounds are not a hard operating-system memory sandbox.

Date projection and historical/submillisecond limitations are documented in [Binary workbook dates](legacy-workbook-dates.md).

## Verification

- Unit tests exercise container/record bounds, unsafe input rejection, styles, formula caches, cancellation, source aliases, routes and session template restrictions.
- Production Chrome worker tests compare exact projections with native-reader output using independent LibreOffice XLS and pandas XLSB fixtures.
- Browser UI acceptance covers sheet selection, comparison, editing/history, malformed replacement atomicity, mixed XLSX cache copy, exports and sessions.
- Electron acceptance covers direct/folder/archive opening, saved-session reconstruction, source protection and independent openpyxl export readback.

Both packaged Mac builds, installed startup/assets, local Finder Services and all three download archives passed verification. Windows runtime testing remains deferred by request. Cached-value input is one part of the broader spreadsheet goal, not full workbook feature parity.
