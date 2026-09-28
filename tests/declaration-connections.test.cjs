const assert = require('node:assert/strict');
const { test } = require('node:test');
const { initialize } = require('./helpers/viewer-harness.cjs');
const node = (id, file = id) => ({ id, file, kind: 'theorem' });
const edge = (source, target) => ({ source, target });
function chain() {
  return { nodes: [node('seed', 'Base'), node('consumer', 'Consumer')], edges: [],
    supportNodes: [node('helper1', 'Filtered'), node('helper2', 'Consumer')],
    supportEdges: [edge('seed', 'helper1'), edge('helper1', 'helper2'), edge('helper2', 'consumer')] };
}
test('direct edges remain available without optional support data', () => {
  const view = initialize({ nodes: [node('a'), node('b')], edges: [edge('a', 'b'), edge('a', 'b')] });
  assert.deepEqual(view.value('visibleDeclarationEdges'), [{ source: 'a', target: 'b', via: [] }]);
});
test('selected file pairs survive declaration and file id collisions', () => {
  const view = initialize({
    nodes: [node('Indexed', 'Indexed'), node('Normalize', 'Normalize')],
    edges: [edge('Indexed', 'Normalize')]
  });
  view.run(`positions = new Map([['Indexed',{x:0,y:0,radius:10}],['Normalize',{x:100,y:0,radius:10}]]);
    highlightedFiles.add('Indexed'); highlightedFiles.add('Normalize');
    selectionConnectionsOnly = true; renderEdges();`);
  assert.equal(view.elements.get('edges').children.length, 1);
});
test('expanded file edges keep their declaration identity when IDs collide', () => {
  const view = initialize({
    nodes: [node('Indexed', 'Indexed'), node('Normalize', 'Normalize')],
    edges: [edge('Indexed', 'Normalize')]
  });
  view.run(`positions = new Map([['Indexed',{x:0,y:0,radius:10}],['Normalize',{x:100,y:0,radius:10}]]);
    declPositions = new Map([['Indexed',{x:0,y:0}],['Normalize',{x:100,y:0}]]);
    expanded.add('Indexed'); showAllConnections = true; renderEdges();`);
  assert.equal(view.elements.get('edges').children.length, 1);
});
test('hidden chains connect visible endpoints with an ordered witness', () => {
  const view = initialize(chain());
  assert.deepEqual(view.value('visibleDeclarationEdges'),
    [{ source: 'seed', target: 'consumer', via: ['helper1', 'helper2'] }]);
  assert.deepEqual(view.value('theoremSinks.map(n => n.id)'), ['consumer']);
  view.run("supportRoots.add('consumer'); rebuildSupportFiles()");
  assert.deepEqual(view.value('[...supportFiles].sort()'), ['Base', 'Consumer']);
});
test('visible intermediates are boundaries, not shortcuts; unused hidden leaves add no users', () => {
  const graph = chain();
  graph.nodes.push(node('final'));
  graph.edges.push(edge('consumer', 'final'));
  graph.supportEdges.push(edge('final', 'unusedLeaf'));
  const view = initialize(graph);
  assert.deepEqual(view.value('visibleDeclarationEdges.map(e => [e.source,e.target])'),
    [['seed', 'consumer'], ['consumer', 'final']]);
  assert.deepEqual(view.value('theoremSinks.map(n => n.id)'), ['final']);
});
test('diamonds deduplicate, shortest witnesses win, and direct edges take precedence', () => {
  const graph = chain();
  graph.supportEdges.push(edge('seed', 'short'), edge('short', 'consumer'));
  let view = initialize(graph);
  assert.deepEqual(view.value('visibleDeclarationEdges'),
    [{ source: 'seed', target: 'consumer', via: ['short'] }]);
  graph.edges.push(edge('seed', 'consumer'));
  view = initialize(graph);
  assert.deepEqual(view.value('visibleDeclarationEdges'), [{ source: 'seed', target: 'consumer', via: [] }]);
});
test('cycles terminate, preserve reachable users, and do not manufacture self uses', () => {
  const graph = chain();
  graph.supportEdges.push(edge('helper2', 'helper1'), edge('consumer', 'helper2'));
  const view = initialize(graph);
  assert.deepEqual(view.value('visibleDeclarationEdges'),
    [{ source: 'seed', target: 'consumer', via: ['helper1', 'helper2'] }]);
  assert.deepEqual(view.value('theoremSinks.map(n => n.id)'), ['consumer']);
});
test('shared helpers keep each visible consumer and prerequisite', () => {
  const graph = chain();
  graph.nodes.push(node('secondSeed'), node('secondConsumer'));
  graph.supportEdges.push(edge('secondSeed', 'helper1'), edge('helper2', 'secondConsumer'));
  const view = initialize(graph);
  assert.deepEqual(view.value('visibleDeclarationEdges.map(e => [e.source,e.target])'),
    [['seed','consumer'], ['secondSeed','consumer'], ['seed','secondConsumer'], ['secondSeed','secondConsumer']]);
});
test('Uses and Used by render the same hidden connection and explain its witness', () => {
  const view = initialize(chain());
  for (const [selected, heading, other] of [['consumer', 'Uses (1)', 'seed'], ['seed', 'Used by (1)', 'consumer']]) {
    view.run(`selected = { type: 'declaration', id: '${selected}' }; updateDetails()`);
    const children = view.elements.get('details').children;
    assert.ok(children.some(child => child.textContent === heading));
    const items = children.flatMap(child => child.tagName === 'ul' ? child.children : []);
    assert.equal(items.length, 1);
    assert.equal(items[0].textContent, `${other} (via hidden declarations)`);
    assert.equal(items[0].title, 'seed → consumer (via helper1 → helper2)');
  }
});
function position(view) {
  view.run(`positions = new Map([['Base', {x:0,y:0,radius:10}], ['Consumer', {x:200,y:0,radius:10}]]);
    declPositions = new Map([['seed',{x:0,y:40}], ['consumer',{x:200,y:40}]]);`);
}
test('collapsed, expanded, mixed, and selected-only views render hidden connections', () => {
  for (const expanded of [[], ['Base'], ['Consumer'], ['Base','Consumer']]) {
    for (const selectedOnly of [false, true]) {
      const view = initialize(chain()); position(view);
      view.run(`selectionConnectionsOnly = ${selectedOnly}; showAllConnections = true;
        highlightedFiles.add('Base'); highlightedFiles.add('Consumer');
        ${expanded.map(file => `expanded.add('${file}');`).join('')}
        renderEdges();`);
      const paths = view.elements.get('edges').children;
      assert.equal(paths.length, 1, JSON.stringify({expanded, selectedOnly}));
      const isDeclaration = !selectedOnly || expanded.length > 0;
      assert.equal(paths[0].attributes.class.includes('declaration'), isDeclaration);
      if (isDeclaration) assert.match(paths[0].children[0].textContent, /via helper1 → helper2/);
    }
  }
});
test('declaration selection draws incoming and outgoing arrows including selected-only mode', () => {
  for (const [id, direction] of [['consumer','incoming'], ['seed','outgoing']]) {
    const view = initialize(chain()); position(view);
    view.run(`expanded.add('Base'); expanded.add('Consumer'); highlightedDeclarations.add('${id}'); renderEdges()`);
    const paths = view.elements.get('edges').children;
    assert.equal(paths.length, 1);
    assert.match(paths[0].attributes.class, new RegExp(direction));
    assert.equal(paths[0].attributes['marker-end'], `url(#arrow-${direction})`);
    view.run("highlightedDeclarations.add('seed'); highlightedDeclarations.add('consumer'); selectionConnectionsOnly = true; renderEdges()");
    assert.equal(view.elements.get('edges').children.length, 1);
  }
});
test('file links include hidden uses but import audits still use original cross-file edges', () => {
  const graph = chain();
  graph.directImports = [edge('Base', 'Consumer')];
  const view = initialize(graph);
  assert.deepEqual(view.value('connections.map(c => [c.a,c.b,c.uses])'), [['Base','Consumer',1]]);
  assert.deepEqual(view.value('[...fileUsagePairs().values()].map(p => [p.from,p.to,p.examples.length])'),
    [['Base','Consumer',1]]);
  // This synthetic path goes through Filtered: the inferred Base -> Consumer
  // connection must not be treated as a direct compiled use in the import audit.
  assert.deepEqual(view.value('importCandidates.map(c => [c.source,c.target])'), [['Base','Consumer']]);
});
test('selected-only and normal modes draw file arrows in the same, true direction', () => {
  // Alphabetical order (Algorithms < Collections) is the reverse of the
  // dependency direction (Collections.Indexed -> Algorithms.Normalize).
  const prerequisite = 'Collections.Indexed', dependent = 'Algorithms.Normalize';
  // Paths are "M x1 y1 L x2 y2"; the arrowhead sits at (x2, y2).
  const direction = view => view.value(`edgesLayer.children.map(n => n.attributes.d)`)
    .map(d => { const [, x1, , , x2] = d.split(' ').map(Number); return Math.sign(x2 - x1); });
  const setup = extra => {
    const view = initialize({
      nodes: [node('idx', prerequisite), node('norm', dependent)],
      edges: [edge('idx', 'norm')],
      directImports: [{ source: prerequisite, target: dependent }]
    });
    view.run(`positions = new Map([['${prerequisite}',{x:0,y:0,radius:10}],['${dependent}',{x:100,y:0,radius:10}]]);
      declPositions = new Map([['idx',{x:0,y:0}],['norm',{x:100,y:0}]]); ${extra} renderEdges();`);
    return view;
  };
  const selectedOnly = setup(`highlightedFiles.add('${prerequisite}'); highlightedFiles.add('${dependent}');
    selectionConnectionsOnly = true;`);
  const normal = setup(`highlightedFiles.add('${dependent}');`);
  const expanded = setup(`highlightedFiles.add('${prerequisite}'); highlightedFiles.add('${dependent}');
    expanded.add('${prerequisite}'); expanded.add('${dependent}'); selectionConnectionsOnly = true;`);
  for (const view of [selectedOnly, normal, expanded]) {
    const signs = direction(view);
    assert.ok(signs.length > 0);
    assert.deepEqual(signs, signs.map(() => 1), 'every arrow points prerequisite -> dependent');
  }
});
