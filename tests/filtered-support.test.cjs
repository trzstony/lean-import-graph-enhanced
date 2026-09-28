const assert = require("node:assert/strict");
const { test, after } = require("node:test");
const { execFileSync } = require("node:child_process");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const vm = require("node:vm");

const root = resolve(__dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "import-graph-filtered-support-"));
after(() => rmSync(temporary, { recursive: true, force: true }));
const namespace = "ImportGraphPackageTest.FilteredSupport";
const base = `${namespace}.Base`;
const consumer = `${namespace}.Consumer`;
const bridge = "ImportGraphPackageTestBridge.Bridge";
const step = "ImportGraphPackageTestBridge.Step";
const fixtureName = suffix => `${namespace}.${suffix}`;
execFileSync("lake", ["build", "graph", consumer], {
  cwd: root, stdio: "pipe", encoding: "utf8"
});

function exportGraph(label, flags) {
  const output = join(temporary, `${label}.html`);
  execFileSync("lake", ["exe", "graph", "--to", consumer, ...flags, output], {
    cwd: root, stdio: "pipe", encoding: "utf8"
  });
  const html = readFileSync(output, "utf8");
  const data = JSON.parse(html.match(/const DECLARATIONS = (.*?);<\/script>/)[1]);
  const gexf = JSON.parse(html.match(/const IMPORTS_GEXF = (.*?); const DECLARATIONS/)[1]);
  const modules = [...gexf.matchAll(/<node id="([^"]+)"/g)].map(match => match[1]);
  return { data, modules };
}
const filtered = exportGraph("filtered", []);
const direct = exportGraph("direct", ["--include-direct"]);
const complete = exportGraph("complete", ["--include-deps"]);
const viewer = readFileSync(join(root, "html-template/enhanced-viewer.js"), "utf8");
// Exercise the actual viewer algorithms, including support traversal, without a DOM.
const initialization = viewer.slice(0, viewer.indexOf("function fileColor("));
assert.ok(initialization.includes("function rebuildSupportFiles()"));
function evaluate(graph, expression) {
  return Array.from(vm.runInNewContext(initialization + "\n" + expression, {
    DECLARATIONS: graph.data, IMPORTS_GEXF: "", document: { getElementById: () => ({}) },
    graphology: {}, graphologyLibrary: { gexf: { parse: () => ({
      nodes: () => graph.modules, forEachEdge: () => {}
    }) } }
  }));
}
const sinks = graph => evaluate(graph, "theoremSinks.map(node => node.id)");
const support = (graph, id) => evaluate(graph,
  `supportRoots.add(${JSON.stringify(id)}); rebuildSupportFiles(); [...supportFiles].sort()`);

for (const suffix of ["viaProof", "viaStatement", "viaInstance"]) {
  test(`${suffix}: support survives filtering both intermediate modules`, () => {
    const id = fixtureName(suffix);
    assert.deepEqual(support(filtered, id), [base]);
    assert.deepEqual(support(filtered, id),
      support(complete, id).filter(file => filtered.modules.includes(file)));
    assert.deepEqual(support(direct, id),
      support(complete, id).filter(file => direct.modules.includes(file)));
  });
}

test("filtered intermediates preserve sink status for proof, statement, and instance uses", () => {
  for (const graph of [filtered, direct, complete]) {
    const result = sinks(graph);
    for (const seed of ["seedProof", "seedStatement", "seedImplicit"]) {
      assert.ok(!result.includes(fixtureName(seed)), `${seed} is used through a filtered path`);
    }
    assert.ok(result.includes(fixtureName("viaProof")), "terminal theorem remains a sink");
  }
});

test("intermediate metadata preserves the display filter and original direct edges", () => {
  assert.ok(!filtered.modules.includes(bridge));
  assert.ok(!filtered.modules.includes(step));
  assert.ok(direct.modules.includes(bridge));
  assert.ok(!direct.modules.includes(step));
  assert.ok(!filtered.data.nodes.some(node => node.file === bridge || node.file === step));
  for (const file of [bridge, step]) {
    assert.ok(filtered.data.supportNodes.some(node => node.file === file), file);
  }
  assert.ok(filtered.data.supportEdges.some(edge =>
    edge.source === "ImportGraphPackageTestBridge.proofBridge" &&
    edge.target === fixtureName("viaProof")));
  assert.ok(!filtered.data.edges.some(edge => edge.source === fixtureName("seedProof") &&
    edge.target === fixtureName("viaProof")), "do not invent a direct-use edge");
});

test("unrelated hidden users and import-only files do not become support", () => {
  assert.ok(sinks(filtered).includes(fixtureName("unusedSeed")));
  assert.ok(!filtered.data.supportNodes.some(node =>
    node.id === "ImportGraphPackageTestBridge.unusedConsumer"));
  assert.ok(filtered.modules.includes(`${namespace}.ImportOnly`));
  assert.ok(!support(filtered, fixtureName("viaProof")).includes(`${namespace}.ImportOnly`));
  assert.ok(!filtered.data.supportNodes.some(node => node.file.startsWith("Init.")),
    "external branches that cannot return to retained declarations should be pruned");
});
