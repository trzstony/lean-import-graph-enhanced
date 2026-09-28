# LeanGraphFixture

This directory is a manual fixture for the import graph HTML viewer.

The dependency shape is intentionally layered:

```text
Prelude
├── Algebra.Monoid ── Algebra.Order ──┐
└── Collections.Bag ── Collections.Indexed ── Algorithms.Normalize
                                      └────── Algorithms.Score ── Api ── Reexports ── Facade
```

`LeanGraphFixture.lean` is the graph root. It also has two redundant direct
imports, so the file-decoupling report has entries to inspect. `Loose.lean` is
compiled and included in the source directory but is intentionally not imported
by the root, which makes it useful for testing dimmed or filtered files.

## Regenerate the fixture

From the repository root:

```bash
lake build LeanGraphFixture LeanGraphFixture.Loose
lake exe graph --to LeanGraphFixture --mark-package --mark-sorry \
  --file-decoupling LeanGraphFixture-file-decoupling.md \
  LeanGraphFixture.html
```

This writes `LeanGraphFixture.html`, a self-contained offline viewer, and
`LeanGraphFixture-file-decoupling.md`, which lists direct imports without
cross-file declaration uses. Both are generated outputs and are not committed;
the feature videos in the main [README](../README.md) were recorded on this
viewer.
