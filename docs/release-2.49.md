# Further Compare 2.49.0

Audio Compare now opens classic PCM AIFF (`.aif` and `.aiff`) files. It can compare AIFF with AIFF or equivalent WAV samples, play both sides, apply offsets/tolerance, export the comparison report and reopen saved sessions. Folder double-clicks and file-manager launch routing recognize AIFF extensions.

Supported AIFF inputs are mono/stereo, 1–32-bit PCM, with integer sample rates from 1 to 384000 Hz. Existing limits of 32 MB per file and 8 million samples apply. AIFF-C, other compressed audio formats and fractional sample rates remain unsupported. Comparison requires matching sample rates and channel counts and does not resample.

Sessions preserve the original AIFF data. Playback uses a lossless in-memory PCM WAV conversion; the source files are not changed. The parser handles sound offsets, block-alignment tails, reordered chunks and padded optional metadata, and rejects malformed layouts before allocating sample buffers. The format implementation follows [Apple’s AIFF 1.3 specification](https://blog.zamzar.com/wp-content/uploads/2014/10/aiffspecs.pdf).

All 447 unit tests passed, including all 32 integer sample widths, exact cross-format comparisons, single-bit 32-bit differences, malformed inputs and shell routing. Existing WAV browser and desktop workflows passed. Native AIFF tests cover playback readiness, reports, original-byte session persistence and folder routing.

The final Apple Silicon and Intel Mac packages passed the AIFF workflow checks. All three packages matched source and passed archive and download verification. Windows runtime testing remains pending.
