# Further Compare 2.23.0

Binary comparison now aligns inserted and deleted bytes by default. Visible gaps keep unchanged suffixes together; each pane displays its own physical hexadecimal offsets, and byte tooltips give the exact offset. Editing, undo and saved output continue to use physical right-file offsets.

The comparison selector can use matching offsets instead, and this preference is saved in sessions. Paging is based on aligned positions and preserves offsets across page boundaries. Decoded data and comparison results are cached between page changes. Opened empty binary files can now be saved.

Alignment trims common prefixes and suffixes, then applies a bounded byte diff to the unmatched middle. When both middles are nonempty, their combined limit is 262,144 bytes, with a 200 ms diff budget and maximum edit length of 2,048. Exceeding a limit falls back to full offset comparison with an explicit explanation. Pure insertions/deletions and equal files can bypass that middle diff. Alignment does not claim a unique interpretation for repeated byte patterns. Advanced range editing remains pending.

Validation: all 177 unit tests passed. Native macOS workflow checks passed for insertion in both directions, matching suffixes, actual-offset edits/save/undo, session persistence, empty-file saves and page boundaries. The alignment workflow also passed in both final macOS packages, including the explicit size-limit fallback. Existing advanced comparison workflows also passed. All three release ZIPs passed integrity checks and their packaged UI matched the source build. Windows runtime validation remains pending on a Windows host.
