# Further Compare 2.87.0

Compare Parent Folders opens a fresh folder comparison from the parents of the current two disk inputs. It is available from Session, tab right-click, and folder right-click Navigate. Text inputs use native-loaded paths; advanced inputs use process-local disk capabilities. Folder sessions can open their parent pair in a separate tab. The original comparison, including unsaved text, remains available.

Both parents are staged before a new context is created. Missing inputs, invalid capabilities, changed input identities and the existing overlapping-root restriction reject the request without adding a tab. Embedded inputs without disk authority and three-way folder reviews cannot use this command. No source file is changed.

The source desktop regression passed for native and tab-context routes, disk text and binary inputs, new folder rows, preserved unsaved text, missing/forged authority rejection, overlap rejection and unchanged source files. The shared advanced-input authority route supports current editors that retain native disk tokens; runtime acceptance in this release specifically exercises binary inputs. Package verification is recorded in implementation-plan.json.

Full product parity and Windows runtime remain outstanding.

Final Apple Silicon and Intel workflows passed. All three package versions and changed assets matched source; ZIP integrity and download links, sizes and SHA-256 checks passed.
