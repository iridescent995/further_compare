# Further Compare 2.80.0

Text comparison now stays in the editable workspace. Differences update automatically while typing, with virtual line numbers, pastel line backgrounds and changed-word highlights. Word wrap remains active during comparison, merge, search, replacement and tab restoration. The separate Compare view switch is removed from the interface.

Compact chrome and collapsed search give the editors more room. Filters & options holds comparison rules, encoding, alignment, clipboard and file-manager settings; More holds line navigation and bookmarks. Focus filters emphasize matching or changed lines while keeping the full text editable. Long lines over 2,000 characters retain line-level highlighting without word-level marks.

Folder selection also supports detailed text-file reports through Reports > Text file report and the native View menu. Reports read only up to 20 selected registered text-file pairs, enforce byte/line budgets, reject stale or unsupported inputs and export HTML, JSON or text without creating tabs. Encoding and line endings are recorded; text comparison normalizes line endings and follows selected whitespace/case rules.

Validation: 573 unit tests passed, plus browser and source desktop checks for live comparison, wrap persistence, text editing/history, rules, search, themes and selected-file reports. A 10,000-line surface regression covers virtualized scrolling and wrapped highlighting. Package acceptance is recorded in implementation-plan.json. Windows runtime and full product parity remain outstanding.

Final Apple Silicon and Intel packages passed live-editor and selected-report acceptance. All three package versions/assets matched source; ZIP integrity and download links, sizes and SHA-256 checks passed. Hidden desktop screenshots were excluded after an Intel capture timeout; browser light/dark screenshots and desktop behavioral assertions passed.
