# PDF text ordering in CLI and batch comparisons

Text comparisons accept `--pdf-order document|page-rows`. The default, `document`, retains PDF.js extracted item order and the existing version 1 projection metadata. `page-rows` requests geometric page-row ordering and reports version 2 metadata with `order: "page-rows"` and `orderVersion: 1`.

```
node scripts/compare.cjs --left left.pdf --right right.pdf --type text --pdf-order page-rows --format json --output report.json
```

The policy applies to PDF inputs only. Other text/document inputs retain their existing extraction behavior. This is text comparison, not layout analysis or OCR. Geometric rows do not establish column, table, or logical reading order. Unsupported geometry fails explicitly; there is no silent fallback to document order.

Version 1 batch jobs accept optional `pdfOrder: "document"` or `pdfOrder: "page-rows"` in text mode. A dry run includes the effective `pdfOrder` on each text job and `order` on each PDF conversion descriptor, without extracting documents or writing reports. Desktop batch preview and execution use the same validated plan.

```
{"version":1,"jobs":[{"left":"left.pdf","right":"right.pdf","output":"report.json","type":"text","format":"json","pdfOrder":"page-rows"}]}
```

Invalid policies and use of the option outside text mode fail before report creation. Reports contain the actual validated extraction provenance, not merely the requested policy. Existing bounds, cancellation, source-change checks, and exclusive report publication remain in effect.
