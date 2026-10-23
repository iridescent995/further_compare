# Further Compare 2.53.0

Run repeated text, folder, binary and CSV/TSV table comparisons from a versioned JSON batch script. Paths resolve relative to the script. The source CLI supports `--dry-run`; the desktop app provides **File → Batch Comparisons…** to choose a script and review the jobs without writing reports.

Run the reviewed batch after native confirmation. Changed plans require a fresh review. Each job writes a new JSON, text or HTML report and receives a same, different or error result. Existing reports are never overwritten, duplicate destinations are rejected, and reports must be outside all compared input folders. A failure during execution does not remove successful reports or prevent later jobs from running.

All 464 unit checks passed. Both packaged Mac architectures passed no-write review, forged-token rejection, cancellation, changed-plan rejection, all four engines, report creation and overwrite protection. All three archives passed integrity/source checks and website download verification.

Windows runtime testing remains pending. Batches currently compare and report; scripted synchronization and broader automation remain unfinished. See [batch usage and JSON example](cli.md#batch-comparison-scripts).
