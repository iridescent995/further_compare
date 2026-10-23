# Independent BIFF8 formula controls

`produce.cjs` authors XLSX using ExcelJS, adds one worksheet-local defined name directly to the OOXML workbook metadata, and converts it with LibreOfficeDev 26.8.0.0.alpha0 (`2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`) to MS Excel 97 XLS and back to XLSX. No Further Compare parser or formula decoder is used to produce either binary or readback. The original OOXML and independent readback are retained.

Data has numeric A1:B3 values (2,3; 4,5; 6,7), SUM in C1 (5), workbook name Rate plus Other!A1 in C2 (12), local name LocalRate+1 in C3 (4). D1:D3 is a genuine shared formula A1*2 (4,8,12). E1:E3 is a genuine array formula A1:A3*2 (4,8,12). Rate refers to Data!$A$1; LocalRate is scoped to Data and refers to Data!$B$1. Other!A1 is 10.

LibreOffice emits BIFF8 ShrFmla, Array, Lbl, SupBook and ExternSheet records. Tests inspect the authoritative census and verify independently reimported values. These controls qualify this profile, not every Excel formula token or external workbook reference. Regeneration timestamps may change container hashes.

SHA-256 of checked-in fixtures:

- authored.xlsx: `fdf76c25dbf3155e79989fe7ec9e0f0c51e385ccb106aaa57ce88aa8b7445c7a`
- formulas.xls: `0cfe1b2136a3d1cf0be508e56aa1b75b79d27ce659241ee01b081c4420701c27`
- readback.xlsx: `67d0d0303d3c437cf8bb1b35a1b63bfd72d50cb2a4f1b2e78f5d373f0c491e7a`
