const assert = require("node:assert/strict");
const { test, after } = require("node:test");
const { execFileSync } = require("node:child_process");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const vm = require("node:vm");

const root = resolve(__dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "import-graph-sinks-"));
after(() => rmSync(temporary, { recursive: true, force: true }));
const fixture = "ImportGraphPackageTest.Declarations";
const sourceFixture = "ImportGraphPackageTest.SourceTheorems";
execFileSync("lake", ["build", "graph", fixture, sourceFixture], { cwd: root, stdio: "pipe", encoding: "utf8" });
const output = join(temporary, "graph.html");
execFileSync("lake", ["exe", "graph", "--to", fixture, output], {
  cwd: root, stdio: "pipe", encoding: "utf8"
});
const html = readFileSync(output, "utf8");
const data = JSON.parse(html.match(/const DECLARATIONS = (.*?);<\/script>/)[1]);
const viewer = readFileSync(join(root, "html-template/enhanced-viewer.js"), "utf8");
// Execute the viewer's actual data initialization, before rendering starts.
const initialization = viewer.slice(0, viewer.indexOf("function rebuildSupportFiles()"));
assert.ok(initialization.includes("const theoremSinks ="));
function initialize(graph, expression) {
  const modules = [...new Set(graph.nodes.map(node => node.file))];
  return Array.from(vm.runInNewContext(initialization + "\n" + expression, {
    DECLARATIONS: graph, IMPORTS_GEXF: "", document: { getElementById: () => ({}) },
    graphology: {}, graphologyLibrary: { gexf: { parse: () => ({
      nodes: () => modules, forEachEdge: () => {}
    }) } }
  }));
}
const sinks = graph => initialize(graph, "theoremSinks.map(n => n.id)");
const name = suffix => `${fixture}.${suffix}`;
const byId = new Map(data.nodes.map(node => [node.id, node]));

test("generated constructor and extensionality theorems are hidden", () => {
  for (const suffix of ["Sample.mk.inj", "Sample.mk.injEq", "Sample.mk.sizeOf_spec",
    "Sample.ext", "Sample.ext_iff"]) {
    assert.ok(!byId.has(name(suffix)), suffix);
  }
  assert.ok(!data.nodes.some(node => /PrivateSample.*\.(inj|injEq|sizeOf_spec)$/.test(node.label)));
  assert.ok(data.supportNodes.some(node => node.id === name("Sample.mk.inj")));
  assert.ok(data.supportEdges.some(edge => edge.source === name("Sample.mk.inj") &&
    edge.target === name("sample_injective")));
});

test("authored lookalikes and private theorems remain visible", () => {
  const result = sinks(data);
  for (const suffix of ["Authored.mk.injEq", "Authored.mk.sizeOf_spec", "final_result"]) {
    assert.ok(result.includes(name(suffix)), suffix);
  }
  const privateTheorem = data.nodes.find(node => node.label === name("private_sink"));
  assert.ok(privateTheorem);
  assert.ok(result.includes(privateTheorem.id));
  assert.ok(!result.includes(name("used_theorem")));
});

test("authored private helper-like names remain visible and retain sink status", () => {
  const result = sinks(data);
  for (const suffix of ["proof_1", "eq_1", "match_1", "omega_1", "proof_10.ordinary"]) {
    const label = name(`PrivateNames.${suffix}`);
    const declaration = data.nodes.find(node => node.label === label);
    assert.ok(declaration, `${label} must be visible`);
    assert.equal(declaration.kind, "theorem");
    assert.ok(result.includes(declaration.id), `${label} must be a sink`);
  }
});

test("uses of private helper-like names retain their declaration edges", () => {
  const label = name("PrivateNames.proof_2");
  const declaration = data.nodes.find(node => node.label === label);
  assert.ok(declaration, `${label} must be visible`);
  assert.ok(data.edges.some(edge => edge.source === declaration.id &&
    edge.target === name("PrivateNames.uses_private")));
  assert.ok(!sinks(data).includes(declaration.id));
});

test("generated private helpers remain hidden and available for support tracing", () => {
  const label = name("PrivateSample.mk.inj");
  assert.ok(!data.nodes.some(node => node.label === label));
  const helper = data.supportNodes.find(node => node.label === label);
  assert.ok(helper, "the generated private constructor lemma must remain in support data");
  const consumer = data.nodes.find(node => node.label === name("private_sample_injective"));
  assert.ok(consumer);
  assert.ok(data.supportEdges.some(edge => edge.source === helper.id &&
    edge.target === consumer.id));
});

test("proof-valued projections are fields, not theorem sinks", () => {
  assert.equal(byId.get(name("Sample.valid"))?.kind, "field");
  assert.equal(byId.get(name("Sample.value"))?.kind, "field");
  assert.ok(!sinks(data).includes(name("Sample.valid")));
});

test("sink detection follows hidden chains but ignores unused generated leaves", () => {
  const nodes = ["used", "consumer", "unused"].map(id => ({ id, kind: "theorem", file: "Test" }));
  const graph = { nodes, edges: [], supportNodes: [], supportEdges: [
    { source: "used", target: "helper1" },
    { source: "helper1", target: "helper2" },
    { source: "helper2", target: "consumer" },
    { source: "unused", target: "generatedLeaf" }
  ] };
  assert.deepEqual(sinks(graph), ["consumer", "unused"]);
});

test("hidden helper uses still prevent false unused-import suggestions", () => {
  const graph = {
    nodes: [
      { id: "base", kind: "theorem", file: "Base" },
      { id: "consumer", kind: "theorem", file: "Consumer" }
    ],
    edges: [],
    supportNodes: [{ id: "helper", kind: "theorem", file: "Base" }],
    supportEdges: [{ source: "helper", target: "consumer" }],
    directImports: [{ source: "Base", target: "Consumer" }]
  };
  assert.deepEqual(initialize(graph, "importCandidates.map(c => c.key)"), []);
});

// These generators provide exact, narrowed ranges and even matching identifier
// text. Authorship must depend on the source command, not either heuristic.
const sourceOutput = join(temporary, "source-theorems.html");
execFileSync("lake", ["exe", "graph", "--to", sourceFixture, sourceOutput], {
  cwd: root, stdio: "pipe", encoding: "utf8"
});
const sourceHtml = readFileSync(sourceOutput, "utf8");
const sourceData = JSON.parse(sourceHtml.match(/const DECLARATIONS = (.*?);<\/script>/)[1]);
const sourceName = suffix => `${sourceFixture}.${suffix}`;

test("narrow generated locations do not establish authored theorem sinks", () => {
  for (const suffix of ["generatedUsed", "generatedUnused"]) {
    assert.ok(!sourceData.nodes.some(node => node.id === sourceName(suffix)), suffix);
    assert.ok(sourceData.supportNodes.some(node => node.id === sourceName(suffix)), suffix);
    assert.ok(!sinks(sourceData).includes(sourceName(suffix)), suffix);
  }
  assert.ok(sinks(sourceData).includes(sourceName("unusedSeed")),
    "an unused generated leaf must not suppress an authored sink");
});

test("generated theorem proofs remain available to dependency tracing", () => {
  for (const [source, target] of [["seed", "generatedUsed"], ["generatedUsed", "consumer"]]) {
    assert.ok(sourceData.supportEdges.some(edge => edge.source === sourceName(source) &&
      edge.target === sourceName(target)));
  }
  assert.ok(!sinks(sourceData).includes(sourceName("seed")));
  assert.ok(sinks(sourceData).includes(sourceName("consumer")));
});

test("source header checks preserve lemma, attributed, private and Unicode theorems", () => {
  for (const suffix of ["authored_fst", "«authored theorem»", "qualified", "polymorphic",
    "authored_lemma"]) {
    const theorem = sourceData.nodes.find(node => node.label === sourceName(suffix));
    assert.ok(theorem, suffix);
    assert.ok(sinks(sourceData).includes(theorem.id), suffix);
  }
});

test("unavailable sources are reported without guessing theorem authorship", () => {
  const leanPath = execFileSync("lake", ["env", "printenv", "LEAN_PATH"], {
    cwd: root, encoding: "utf8"
  }).trim();
  const missingOutput = join(temporary, "missing-source.html");
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(join(root, ".lake/build/bin/graph"),
    ["--to", sourceFixture, missingOutput], {
      cwd: temporary, encoding: "utf8",
      env: { ...process.env, LEAN_PATH: leanPath, LEAN_SRC_PATH: temporary }
    });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /cannot verify theorem authorship/);
  const missing = JSON.parse(readFileSync(missingOutput, "utf8")
    .match(/const DECLARATIONS = (.*?);<\/script>/)[1]);
  assert.ok(!missing.nodes.some(node => node.kind === "theorem"));
  assert.ok(missing.supportEdges.some(edge => edge.source === sourceName("seed") &&
    edge.target === sourceName("generatedUsed")));
});
