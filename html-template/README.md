# HTML viewer template

These files are the template for the standalone viewer that
`lake exe graph ... output.html` produces. They are not meant to be opened
directly: the exporter builds one self-contained HTML file from them.

## How the export works

`MainGraph.lean` reads `index.html` and then:

1. replaces each `<script src="...">` tag for `vendor/graphology.min.js`,
   `vendor/graphology-library.min.js`, and `enhanced-viewer.js` with the
   script's contents, and
2. replaces the `__IMPORTS_GEXF__` and `__DECLARATIONS_JSON__` placeholders with
   the file import graph and the declaration graph.

The result needs no web server or internet connection. Because this is plain
text search-and-replace, **any change to those script tags or placeholders must
be mirrored in `MainGraph.lean`.**

## Trying changes

Rebuild a viewer from the demo project and open it in a browser:

```bash
lake build LeanGraphFixture LeanGraphFixture.Loose
lake exe graph --to LeanGraphFixture LeanGraphFixture.html
```

The viewer's graph logic has Node tests that run `enhanced-viewer.js` directly:

```bash
node --test tests/declaration-connections.test.cjs
```

## Credits

Adapted from the [Lean 3 version](https://github.com/eric-wieser/mathlib-import-graph)
by Eric Wieser, published under the [MIT License](./LICENSE_source) included
here. Adaptation by Jon Eugster.
