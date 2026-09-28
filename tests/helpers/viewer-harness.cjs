const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(resolve(__dirname, '../../html-template/enhanced-viewer.js'), 'utf8');
// Execute the real data model and rendering functions, stopping before browser
// event registration and initial layout. No graph logic is reimplemented here.
const viewer = source.slice(0, source.indexOf('let drag = null;'));
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
}
function initialize(data) {
  const elements = new Map();
  const context = vm.createContext({
    DECLARATIONS: data, IMPORTS_GEXF: '',
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
      },
      createElement: tag => new Element(tag),
      createElementNS: (_namespace, tag) => new Element(tag)
    },
    graphology: {}, graphologyLibrary: { gexf: { parse: () => ({
      nodes: () => [...new Set(data.nodes.map(node => node.file))],
      forEachEdge: () => {}
    }) } }
  });
  vm.runInContext(viewer, context);
  return {
    run: code => vm.runInContext(code, context),
    value: expression => JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context)),
    elements
  };
}
module.exports = { initialize };
