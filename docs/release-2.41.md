# Further Compare 2.41.0

The browser text workspace now supports Save As for either pane from its path toolbar and File menu. The download contains encoded bytes from the shared text codec, including the chosen UTF-8, UTF-16LE/BE, Windows-1251/1252 or Latin-1 output, BOM and line endings. Existing mixed endings are preserved until explicitly converted. Downloads use the original filename, or left.txt/right.txt for new text.

Output that cannot represent the text is rejected before a download starts. Encoded output is limited to the browser's existing 2 MB limit. Exporting a file does not mark the comparison session as saved or replace its uploaded source.

Browser tests passed byte-exact left/right and menu downloads, default/original filenames, edited Cyrillic with CRLF, UTF-16BE with BOM, mixed endings, UTF-8 BOM/LF conversion, lossy-output rejection, encoded-size rejection and retained dirty session state. Existing browser comparisons, sessions, mobile layout and appearance tests passed. Native encoding integration passed in the source app and both packaged Mac architectures. All three archives passed ZIP integrity and version/source checks. Download links, sizes, SHA-256 and an actual Windows ZIP browser download passed. Windows runtime verification remains pending.
