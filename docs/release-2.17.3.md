# Further Compare 2.17.3

Background folder comparison now updates colors, comparison provenance and accessible status labels on existing rows. When the visible paths stay the same, focus, selection and scroll positions are preserved without replacing the row elements. This prevents color updates from interrupting row interactions.

When a result changes which rows belong in the active filter, the tree still rebuilds so Differences and Identical views stay accurate. Provenance changes also refresh tooltips and metadata-match styling even when the equality status itself is unchanged.

A deterministic integration test delays real content-comparison results and verifies all 200 row elements in both panes remain the same objects, with selection, focus and scroll preserved. It also checks accessible labels, content provenance, and filter membership after comparisons resolve. The test and existing folder interaction/rule suites pass in development.

The live-color suite also passes in the final Apple Silicon and Intel Mac packages. All three package versions and bundled sources match this release; ZIP integrity, download links, sizes and SHA-256 checks pass.

Windows runtime verification and the broader full-product feature scope remain open.
