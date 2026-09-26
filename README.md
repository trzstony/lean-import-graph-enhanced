# Lean Import Graph

`importGraph` is a reusable Lake package for inspecting Lean imports and the
declarations that make those imports necessary. It is based on the community
`importGraph` tool and adds an offline interactive viewer plus source-aware
import auditing.

## Features

- **Import graph exports.** Generate `.dot` and `.gexf` files, or any format
  supported by Graphviz, with `lake exe graph`.
- **Standalone HTML viewer.** `lake exe graph --to MyProject graph.html`
  produces one self-contained file that works offline. JavaScript dependencies,
  file imports, declaration nodes, and declaration-use edges are embedded in the
  output.
- **File and declaration exploration.** Expand a file to see its definitions,
  theorems, constructors, inductives, axioms, and other declarations. Teal
  arrows show declaration prerequisites; orange arrows show declarations that
  use the selected declaration.
- **Interactive navigation.** Search files or declarations, drag to pan,
  fit the graph, reset the view, and use keyboard focus to inspect a graph
  without a mouse.
- **Cluster and connection views.** Group related files, show every connection,
  or restrict the display to direct edges between selected nodes. The layout
  keeps file circles separate while revealing strongly connected regions.
- **Directory coloring and support tracing.** Color independent folders or a
  complete subtree. Selecting a declaration can highlight the files that provide
  its transitive compiled prerequisites; import-only files are not marked as
  declaration support.
- **File-decoupling audit.** `--file-decoupling report.md` compares direct
  source imports with cross-file declaration uses and writes a reviewable
  Markdown table. The viewer exposes the same candidates, while preserving the
  full source import list even when the visual graph is transitively reduced.
- **Source-only analysis.** `ImportGraph.Imports.FromSource` parses imports
  directly from `.lean` files, so scripts and linters can inspect files before
  they are compiled.
- **Import-analysis commands.** Use `#redundant_imports`, `#min_imports`,
  `#find_home`, and `#import_diff` from `ImportGraph.Tools`, or run
  `lake exe unused_transitive_imports`.
- **Progress reporting.** Expensive environment loading and declaration scans
  show honest terminal progress in both TTY and log-friendly output.

## Quick start

Build the project before graph extraction so Lean can load the target modules:

```bash
lake build
lake exe graph --to MyProject my_graph.html
open my_graph.html       # macOS; use your browser on other systems
```

Common alternatives:

```bash
lake exe graph --to MyProject my_graph.dot
lake exe graph --to MyProject my_graph.gexf
lake exe graph --to MyProject --file-decoupling file-decoupling.md
lake exe graph --from MyProject.Submodule --to MyProject my_graph.html
```

Run `lake exe graph --help` for all filters, including `--include-direct`,
`--include-deps`, `--include-std`, `--include-lean`, `--mark-package`, and
`--mark-sorry`.

## Add it to another Lake project

Use the GitHub repository as a Lake dependency:

```toml
[[require]]
name = "importGraph"
git = "https://github.com/trzstony/lean-import-graph.git"
rev = "main"
```

Then run `lake update` and `lake exe graph ...`. Lean files that need the
analysis API can import:

```lean
import ImportGraph
import ImportGraph.Tools
import ImportGraph.Imports.FromSource
```

The package includes the HTML template and its browser libraries, so generated
HTML does not need a web server or an internet connection. Graphviz is only
needed when exporting formats other than `.dot`, `.gexf`, or `.html`.

## Development

```bash
lake build
lake test
lake exe graph --to ImportGraphPackageTest.ToTarget ImportGraphPackageTest/test.html
```

The test suite covers import analysis, source parsing, tool commands, and the
baseline DOT exporter. Contributions should include a focused test when a
change affects those APIs or the generated graph data.

## License and attribution

This project is released under the Apache 2.0 license. The core import-analysis
implementation originated in Mathlib and the original HTML graph was adapted
from [Eric Wieser's Lean 3 import graph](https://github.com/eric-wieser/mathlib-import-graph).
See [`LICENSE`](LICENSE) and [`html-template/LICENSE_source`](html-template/LICENSE_source)
for the corresponding notices.
