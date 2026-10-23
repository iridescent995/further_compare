# Further Compare 2.69.0

Recursive copy, move and delete now honor the current filename masks, path search, status filter and comparison rules. File actions defaults to Matching files. Choose All contents from the selector or right-click File-action scope menu to include filtered-out descendants. Previews show the captured scope. Excluded source files and their containing folders remain in place.

Aligned entries are classified using their original source and counterpart paths. External copy/move uses that original comparison even when the chosen destination is a third folder. Normalized text and timestamp rules affect eligibility; actual transfers retain original bytes. Complete snapshot coverage protects previews against changed source, counterpart or destination files. Move rechecks counterpart eligibility after backups and before installation.

Validation: 534 unit tests; successful build; real Electron filtered-operation tests on source and both final Mac packages. These tests execute copy/move/delete and external operations against temporary folders, check retained hidden files, and exercise both right-click scope choices. The existing desktop move regression also passes. All three package versions, changed modules, ZIP integrity, and download sizes/hashes were verified.

Windows runtime acceptance and full product parity remain incomplete. Merge/sync exact-row selection semantics remain separate from these recursive file actions.
