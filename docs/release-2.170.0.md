# Version 2.170.0

Local text, folder-child, selected-pair and advanced-file opening now validate staged content and disk identity before publishing native session state. File revisions remain tied to the loaded bytes. The checks include canonical paths, ancestor identities, pair scope and missing counterparts. Failed reads do not create partial child tabs or replace existing native file authority.

Session and workspace restores prepare all native contexts first while retaining saved edited text. Saving text verifies the identity and contents of the file written before adopting the new path.

Source verification includes 1714 passing tests (one skip), deterministic replacement/failure tests, a real dirty-tab/reload failure test, and SFTP authority/origin regressions. Existing desktop, folder-pair, workspace and encoding regressions passed. Both Mac packages passed atomic-opening and encoding tests. All three packages passed source equality, ZIP integrity and browser download verification. Desktop tests now wait for initialized scroll positions and settled folder scans, use the existing Filters dialog, and close their test apps deterministically. Actual Windows runtime testing remains deferred at the user's request.
