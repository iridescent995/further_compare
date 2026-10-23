# Further Compare 2.49.1

Image, table, audio, archive and registry file pickers now have descriptive titles and supported-extension filters, with an All files fallback. Text and binary inputs keep an All files picker. Titles identify the left, right or base input.

The audio picker includes WAV, AIF and AIFF; tables include CSV, TSV and XLSX. The selected file still goes through the existing size, file-authority and format validation. Filters do not convert files or grant access to unselected paths.

Validation uses the existing advanced desktop suite to open real temporary files through all seven comparison types and inspect the native dialog options. It also checks external-editor routing, unsaved data preservation, tab/swap isolation and rejection of unauthorized paths. Invalid picker input kinds and sides were checked separately.

The final Apple Silicon and Intel Mac packages passed the seven-mode regression suite. All three packages matched source and passed archive and download verification. Windows runtime testing remains pending.
