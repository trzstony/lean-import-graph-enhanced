const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { execFileSync } = require('node:child_process');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { initialize } = require('./helpers/viewer-harness.cjs');
const root = resolve(__dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'import-graph-hidden-'));
after(() => rmSync(temporary, { recursive: true, force: true }));
const fixture = 'ImportGraphPackageTest.HiddenConnections.Consumer';
execFileSync('lake', ['build', 'graph', fixture], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
const output = join(temporary, 'graph.html');
execFileSync('lake', ['exe', 'graph', '--to', fixture, output], {
  cwd: root, stdio: 'pipe', encoding: 'utf8'
});
const html = readFileSync(output, 'utf8');
const data = JSON.parse(html.match(/const DECLARATIONS = (.*?);<\/script>/)[1]);
const prefix = 'ImportGraphPackageTest.HiddenConnections';
const seed = `${prefix}.seed`, consumer = `${prefix}.consumer`;
const helpers = [`${consumer}._proof_1`, `${consumer}._proof_2`];

test('compiled proof helpers stay hidden while establishing a visible connection', () => {
  assert.ok(data.nodes.some(n => n.id === seed));
  assert.ok(data.nodes.some(n => n.id === consumer));
  assert.ok(!data.edges.some(e => e.source === seed && e.target === consumer));
  for (const helper of helpers) {
    assert.ok(!data.nodes.some(n => n.id === helper));
    assert.ok(data.supportNodes.some(n => n.id === helper));
  }
  const view = initialize(data);
  assert.deepEqual(view.value(`visibleDeclarationEdges.filter(e => e.target === '${consumer}')`),
    [{ source: seed, target: consumer, via: helpers }]);
  assert.ok(!view.value('theoremSinks.map(n => n.id)').includes(seed));
  assert.ok(view.value('theoremSinks.map(n => n.id)').includes(`${prefix}.unused`));
});
test('compiled connection appears in lists, collapsed arrows, selected arrows, and support colors', () => {
  const view = initialize(data);
  for (const [id, heading] of [[consumer, 'Uses (1)'], [seed, 'Used by (1)']]) {
    view.run(`selected = {type:'declaration', id:'${id}'}; updateDetails()`);
    assert.ok(view.elements.get('details').children.some(n => n.textContent === heading));
  }
  view.run(`supportRoots.add('${consumer}'); rebuildSupportFiles();
    positions = new Map([['${prefix}.Base',{x:0,y:0,radius:10}],
      ['${prefix}.Consumer',{x:200,y:0,radius:10}]]);
    declPositions = new Map([['${seed}',{x:0,y:40}],['${consumer}',{x:200,y:40}]]);
    showAllConnections = true; renderEdges();`);
  assert.deepEqual(view.value('[...supportFiles].sort()'), [`${prefix}.Base`, `${prefix}.Consumer`]);
  assert.ok(view.elements.get('edges').children.some(n =>
    n.attributes.class.includes('declaration') && n.children[0].textContent.includes(helpers[0])));
  view.run(`highlightedDeclarations.add('${seed}'); highlightedDeclarations.add('${consumer}');
    selectionConnectionsOnly = true; renderEdges()`);
  assert.equal(view.elements.get('edges').children.length, 1);
  assert.match(view.elements.get('edges').children[0].children[0].textContent, /via/);
});
