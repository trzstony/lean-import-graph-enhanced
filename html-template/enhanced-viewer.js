// Standalone SVG viewer for file imports and Lean declaration uses.
const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("graph");
const edgesLayer = document.getElementById("edges");
const filesLayer = document.getElementById("files");
const declsLayer = document.getElementById("decls");
const details = document.getElementById("details");
const importAudit = document.getElementById("import-audit");
const sidebar = document.getElementById("sidebar");
const directoryTree = document.getElementById("directory-tree");
const search = document.getElementById("search");
const layoutElement = document.getElementById("layout");
const layoutSplitter = document.getElementById("layout-splitter");
const imports = graphologyLibrary.gexf.parse(graphology.Graph, IMPORTS_GEXF);
const modules = imports.nodes().sort();
const sourceFiles = [...new Set([...modules, ...(DECLARATIONS.files || [])])].sort();
const declarations = new Map(DECLARATIONS.nodes.map(decl => [decl.id, decl]));
const directImports = DECLARATIONS.directImports || [];
// Generated helpers and declarations in filtered files stay out of the visible
// graph, but their metadata preserves compiled dependency paths through them.
const supportDeclarations = new Map(
  (DECLARATIONS.supportNodes || []).map(decl => [decl.id, decl]));
const byFile = new Map(modules.map(file => [file, []]));
for (const decl of DECLARATIONS.nodes) byFile.get(decl.file)?.push(decl);
for (const list of byFile.values()) list.sort((a, b) => a.id.localeCompare(b.id));
const supportIncomingEdges = new Map();
function addIncomingEdge(edge) {
  if (!supportIncomingEdges.has(edge.target)) supportIncomingEdges.set(edge.target, []);
  supportIncomingEdges.get(edge.target).push(edge);
}
for (const edge of DECLARATIONS.edges) {
  addIncomingEdge(edge);
}
for (const edge of DECLARATIONS.supportEdges || []) {
  addIncomingEdge(edge);
}
// Contract paths whose intermediate declarations are hidden. Stop at the first
// visible prerequisite: this is a view of declaration uses, not their transitive
// closure. Keep one shortest witness per pair for tooltips; direct uses win.
function visibleDeclarationConnections() {
  const result = [];
  for (const target of declarations.keys()) {
    const next = new Map([[target, null]]);
    const pending = [target];
    const found = new Set();
    for (let i = 0; i < pending.length; i++) {
      const current = pending[i];
      for (const { source } of supportIncomingEdges.get(current) || []) {
        if (declarations.has(source)) {
          if (source === target || found.has(source)) continue;
          found.add(source);
          const via = [];
          for (let step = current; step !== target; step = next.get(step)) via.push(step);
          result.push({ source, target, via });
        } else if (!next.has(source)) {
          next.set(source, current);
          pending.push(source);
        }
      }
    }
  }
  return result;
}
const visibleDeclarationEdges = visibleDeclarationConnections();
const visibleIncomingEdges = new Map();
const visibleOutgoingEdges = new Map();
for (const edge of visibleDeclarationEdges) {
  if (!visibleIncomingEdges.has(edge.target)) visibleIncomingEdges.set(edge.target, []);
  if (!visibleOutgoingEdges.has(edge.source)) visibleOutgoingEdges.set(edge.source, []);
  visibleIncomingEdges.get(edge.target).push(edge);
  visibleOutgoingEdges.get(edge.source).push(edge);
}
// File-level links are directed like every other edge in the viewer:
// source = prerequisite (imported / used), target = dependent (importer / user).
// Anything that draws an arrow must read from `fileLinks`; the undirected
// `connections` below exist only for layout and clustering.
const fileLinks = new Map();
function addFileLink(source, target, uses = 0) {
  if (source === target || !byFile.has(source) || !byFile.has(target)) return;
  const key = JSON.stringify([source, target]);
  if (!fileLinks.has(key)) fileLinks.set(key, { source, target, imports: 0, uses: 0 });
  fileLinks.get(key)[uses ? "uses" : "imports"]++;
}
imports.forEachEdge((_id, _attrs, source, target) => addFileLink(source, target));
for (const { source, target } of directImports) addFileLink(source, target);
for (const edge of visibleDeclarationEdges) {
  addFileLink(declarations.get(edge.source)?.file, declarations.get(edge.target)?.file, 1);
}
// Undirected view for layout: merge both directions of a pair into one link.
const undirectedLinks = new Map();
for (const { source, target, imports: importCount, uses } of fileLinks.values()) {
  const [a, b] = source < target ? [source, target] : [target, source];
  const key = JSON.stringify([a, b]);
  if (!undirectedLinks.has(key)) undirectedLinks.set(key, { a, b, imports: 0, uses: 0 });
  undirectedLinks.get(key).imports += importCount;
  undirectedLinks.get(key).uses += uses;
}
const connections = [...undirectedLinks.values()].map(link => ({ ...link,
  weight: Math.min(3, 1 + Math.log1p(link.uses) / 2) }));
const neighbors = new Map(modules.map(file => [file, new Set()]));
const weightedNeighbors = new Map(modules.map(file => [file, new Map()]));
for (const { a, b, weight } of connections) {
  neighbors.get(a).add(b); neighbors.get(b).add(a);
  weightedNeighbors.get(a).set(b, weight);
  weightedNeighbors.get(b).set(a, weight);
}

const folderPalette = [
  { stroke: "#b42333", fill: "#f28b90" },
  { stroke: "#137444", fill: "#73d7a4" },
  { stroke: "#6b3bb3", fill: "#bca0ee" },
  { stroke: "#a3510c", fill: "#f1b76c" },
  { stroke: "#1e5f9f", fill: "#82bef2" },
  { stroke: "#a0287b", fill: "#ee91d4" },
  { stroke: "#18727a", fill: "#7bced3" },
  { stroke: "#606d12", fill: "#c7d073" }
];
const supportColor = { stroke: "#ad1680", fill: "#f092d0" };
// User-chosen colors, as palette indexes. Folders and files are kept in separate
// maps because a file and a folder can share a module path (e.g. `Foo.lean` and
// `Foo/`). Precedence: support highlight > the file's own color > its folder's.
const folderSelections = new Map();
const fileSelections = new Map();
const openFolders = new Set();
const folderRoots = new Map();
function makeFolder(name, path) { return { name, path, directories: new Map(), files: [], count: 0 }; }
for (const file of sourceFiles) {
  const parts = file.split(".");
  let folder = folderRoots.get(parts[0]);
  if (!folder) {
    folder = makeFolder(parts[0], parts[0]);
    folderRoots.set(parts[0], folder);
  }
  folder.count++;
  openFolders.add(folder.path);
  for (let i = 1; i < parts.length - 1; i++) {
    const path = parts.slice(0, i + 1).join(".");
    let child = folder.directories.get(parts[i]);
    if (!child) {
      child = makeFolder(parts[i], path);
      folder.directories.set(parts[i], child);
    }
    folder = child;
    folder.count++;
    if (i === 1) openFolders.add(path);
  }
  folder.files.push(file);
}
const defaultOpenFolders = new Set(openFolders);

const expanded = new Set();
const highlightedFiles = new Set();
const highlightedDeclarations = new Set();
const supportRoots = new Set();
const supportFiles = new Set();
// A browser dispatches the first click before it knows whether a second click
// will follow. Delay selection long enough for a double-click to cancel it so
// expanding a file does not briefly select it first.
const doubleClickDelay = 200;
const pendingNodeClicks = new Map();
function deferNodeClick(key, action) {
  clearTimeout(pendingNodeClicks.get(key));
  pendingNodeClicks.set(key, setTimeout(() => {
    pendingNodeClicks.delete(key);
    action();
  }, doubleClickDelay));
}
function cancelNodeClick(key) {
  const timeout = pendingNodeClicks.get(key);
  if (timeout === undefined) return;
  clearTimeout(timeout);
  pendingNodeClicks.delete(key);
}
const selectionOrder = [];
let selected = null;
let positions = new Map();
let declPositions = new Map();
let view = null;
let clusterMode = false;
let showAllConnections = false;
let selectionConnectionsOnly = false;
let auditMode = false;
const usedFilePairs = new Set();
// Hidden generated helpers still establish real cross-file dependencies.
for (const edge of [...DECLARATIONS.edges, ...(DECLARATIONS.supportEdges || [])]) {
  const from = (declarations.get(edge.source) || supportDeclarations.get(edge.source))?.file;
  const to = (declarations.get(edge.target) || supportDeclarations.get(edge.target))?.file;
  if (from && to && from !== to) usedFilePairs.add(JSON.stringify([from, to]));
}
const importCandidates = [];
const candidateKeys = new Set();
for (const { source, target } of directImports) {
  if (!byFile.has(source) || !byFile.has(target)) continue;
  const key = JSON.stringify([source, target]);
  if (!usedFilePairs.has(key) && !candidateKeys.has(key)) {
    importCandidates.push({ source, target, key });
    candidateKeys.add(key);
  }
}
importCandidates.sort((a, b) => a.target.localeCompare(b.target) || a.source.localeCompare(b.source));

// Use the same visible connections as the arrows and usage lists. Hidden
// leaves alone do not count as users, and a cycle back to oneself is not a user.
const theoremSinks = DECLARATIONS.nodes
  .filter(decl => decl.kind === "theorem" && !visibleOutgoingEdges.has(decl.id))
  .sort((a, b) => a.id.localeCompare(b.id));

// Follow compiled declaration uses, including intermediates in filtered files.
// Only displayed prerequisite files are colored; import-only files and the roots
// themselves are not support.
function rebuildSupportFiles() {
  supportFiles.clear();
  const seen = new Set();
  const queue = [...supportRoots];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of supportIncomingEdges.get(id) || []) {
      const source = declarations.get(edge.source) || supportDeclarations.get(edge.source);
      if (source && byFile.has(source.file)) supportFiles.add(source.file);
      queue.push(edge.source);
    }
  }
}
function fileColor(file) {
  if (supportFiles.has(file)) return supportColor;
  if (fileSelections.has(file)) return folderPalette[fileSelections.get(file)];
  return folderColor(file);
}
let cachedFileUsagePairs = null;

function element(tag, attributes = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== null) node.textContent = text;
  return node;
}
function titled(node, title) {
  node.appendChild(element("title", {}, title));
  return node;
}
function shortName(name) { return name.split(".").at(-1); }
function declarationLabel(decl) { return decl?.label || decl?.id || ""; }
function declarationName(id) {
  return declarationLabel(declarations.get(id) || supportDeclarations.get(id)) || id;
}
function declarationConnectionTitle(edge) {
  const endpoints = `${declarationName(edge.source)} → ${declarationName(edge.target)}`;
  return edge.via.length ?
    `${endpoints} (via ${edge.via.map(declarationName).join(" → ")})` : endpoints;
}
// File and declaration nodes have separate identities even when their string
// IDs happen to match (for example, an inductive named `...Indexed` in
// `...Indexed.lean`). Keep the kind alongside every rendered endpoint.
const fileRef = id => ({ id, kind: "file" });
const declarationRef = id => ({ id, kind: "declaration" });
const endpointKey = endpoint => `${endpoint.kind}:${endpoint.id}`;
function folderContains(folder, path) { return path === folder || path.startsWith(folder + "."); }
function folderColor(file) {
  for (const [path, colorIndex] of folderSelections) {
    if (folderContains(path, file)) return folderPalette[colorIndex];
  }
  return null;
}
// Prefer a palette color no folder or file is using yet.
function nextColorIndex() {
  const used = new Set([...folderSelections.values(), ...fileSelections.values()]);
  const index = folderPalette.findIndex((_color, i) => !used.has(i));
  return index < 0 ? used.size % folderPalette.length : index;
}
function selectFolder(path) {
  if (folderSelections.has(path)) {
    folderSelections.delete(path);
  } else {
    // A parent selection colors its complete subtree (clearing any colors
    // inside it); a child folder selection replaces its parent's.
    for (const selectedPath of [...folderSelections.keys()]) {
      if (folderContains(path, selectedPath) || folderContains(selectedPath, path)) {
        folderSelections.delete(selectedPath);
      }
    }
    for (const file of [...fileSelections.keys()]) {
      if (folderContains(path, file)) fileSelections.delete(file);
    }
    folderSelections.set(path, nextColorIndex());
  }
  renderDirectoryTree();
  renderFiles();
}
// A file's own color overrides its folder's; clearing it falls back to the folder.
function selectFileColor(file) {
  if (fileSelections.has(file)) fileSelections.delete(file);
  else fileSelections.set(file, nextColorIndex());
  renderDirectoryTree();
  renderFiles();
}
function renderDirectoryTree() {
  const scrollTop = directoryTree.parentElement.scrollTop;
  directoryTree.replaceChildren();
  function appendFolder(folder, parent) {
    const detailsNode = document.createElement("details");
    detailsNode.open = openFolders.has(folder.path);
    detailsNode.addEventListener("toggle", () => {
      if (detailsNode.open) openFolders.add(folder.path);
      else openFolders.delete(folder.path);
    });
    const summary = document.createElement("summary");
    const pick = document.createElement("button");
    const colorIndex = folderSelections.get(folder.path);
    const swatch = document.createElement("span");
    swatch.className = "directory-swatch";
    if (colorIndex !== undefined) swatch.style.backgroundColor = folderPalette[colorIndex].stroke;
    pick.className = "directory-pick";
    pick.type = "button";
    pick.setAttribute("aria-label", `${colorIndex === undefined ? "Color" : "Remove color from"} folder ${folder.path}`);
    pick.setAttribute("aria-pressed", colorIndex === undefined ? "false" : "true");
    pick.append(swatch);
    pick.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectFolder(folder.path);
    });
    const count = document.createElement("span");
    count.className = "directory-count";
    count.textContent = String(folder.count);
    const name = document.createElement("span");
    name.className = "directory-name";
    name.textContent = folder.name;
    if (colorIndex !== undefined) name.style.color = folderPalette[colorIndex].stroke;
    summary.append(pick, name, count);
    detailsNode.appendChild(summary);
    for (const child of [...folder.directories.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      appendFolder(child, detailsNode);
    }
    if (folder.files.length) {
      const list = document.createElement("ul");
      list.className = "directory-files";
      for (const file of folder.files.sort()) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "directory-file";
        button.textContent = shortName(file) + ".lean";
        const inGraph = imports.hasNode(file);
        button.disabled = !inGraph;
        button.title = inGraph ? file : `${file} (not imported by the selected root module)`;
        button.setAttribute("aria-label", inGraph ?
          `Show connections for ${file}${supportFiles.has(file) ? "; supports a selected declaration" : ""}` :
          `File ${file} outside import graph`);
        const chosenColor = fileColor(file);
        const ownColor = fileSelections.has(file);
        // The circle is its own button (buttons cannot nest): it colors this
        // file, while the name button selects the file in the graph.
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "directory-pick directory-file-pick";
        pick.disabled = !inGraph;
        pick.setAttribute("aria-label", `${ownColor ? "Remove color from" : "Color"} file ${file}`);
        pick.setAttribute("aria-pressed", String(ownColor));
        const fileSwatch = document.createElement("span");
        fileSwatch.className = "directory-file-swatch";
        pick.append(fileSwatch);
        if (chosenColor) {
          fileSwatch.style.backgroundColor = chosenColor.stroke;
          fileSwatch.style.borderColor = chosenColor.stroke;
          button.style.color = chosenColor.stroke;
          button.style.fontWeight = "700";
        }
        if (supportFiles.has(file)) {
          button.classList.add("support");
          button.title = `${file} — supports a selected declaration`;
        }
        if (inGraph) {
          pick.addEventListener("click", () => selectFileColor(file));
          button.addEventListener("click", event => {
            if (event.detail > 1) return;
            deferNodeClick(`file:${file}`, () => selectFile(file, true));
          });
          button.addEventListener("dblclick", () => {
            cancelNodeClick(`file:${file}`);
            toggle(file);
          });
        }
        item.append(pick, button);
        list.appendChild(item);
      }
      detailsNode.appendChild(list);
    }
    parent.appendChild(detailsNode);
  }
  for (const root of [...folderRoots.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    appendFolder(root, directoryTree);
  }
  directoryTree.parentElement.scrollTop = scrollTop;
}
function color(kind) {
  if (kind === "theorem") return "#477bc3";
  if (kind === "definition") return "#25a47c";
  return "#9d72bb";
}
function geometry(file) {
  const count = byFile.get(file)?.length || 0;
  if (!expanded.has(file)) return { radius: 32, columns: 0, rows: 0 };
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(count / 2))));
  const rows = Math.ceil(count / columns);
  const radius = Math.max(82, Math.hypot(columns * 63, rows * 17) + 42);
  return { radius, columns, rows };
}
function ranks() {
  const rank = new Map(modules.map(file => [file, 0]));
  for (let i = 0; i < modules.length; i++) {
    let changed = false;
    imports.forEachEdge((_edge, _attrs, source, target) => {
      if (rank.get(target) < rank.get(source) + 1) {
        rank.set(target, rank.get(source) + 1);
        changed = true;
      }
    });
    if (!changed) break;
  }
  return rank;
}
function dependencyLayout() {
  const grouped = new Map();
  const rank = ranks();
  for (const file of modules) {
    const level = rank.get(file);
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(file);
  }
  const levels = [...grouped.keys()].sort((a, b) => b - a);
  const widths = new Map(levels.map(level => {
    const files = grouped.get(level);
    return [level, files.reduce((width, file) => width + geometry(file).radius * 2, 0) +
      Math.max(0, files.length - 1) * 70];
  }));
  const maxWidth = Math.max(...widths.values());
  let y = 0;
  for (const level of levels) {
    const files = grouped.get(level).sort();
    const maxRadius = Math.max(...files.map(file => geometry(file).radius));
    let x = (maxWidth - widths.get(level)) / 2;
    for (const file of files) {
      const { radius } = geometry(file);
      positions.set(file, { x: x + radius, y: y + maxRadius, radius });
      x += radius * 2 + 70;
    }
    y += maxRadius * 2 + 130;
  }
}
function connectedComponents() {
  const seen = new Set();
  const components = [];
  for (const first of modules) {
    if (seen.has(first)) continue;
    const component = [];
    const queue = [first];
    seen.add(first);
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      component.push(file);
      for (const next of neighbors.get(file)) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}
function communitiesFor(component) {
  if (component.length < 2) return [component];
  const degree = new Map(component.map(file => [file,
    [...weightedNeighbors.get(file).values()].reduce((sum, weight) => sum + weight, 0)]));
  const totalWeight = [...degree.values()].reduce((sum, value) => sum + value, 0);
  const community = new Map(component.map(file => [file, file]));
  const totals = new Map(degree);
  const order = [...component].sort((a, b) => degree.get(b) - degree.get(a) || a.localeCompare(b));
  for (let pass = 0; pass < 20; pass++) {
    let moved = 0;
    for (const file of order) {
      const ownDegree = degree.get(file);
      if (!ownDegree) continue;
      const current = community.get(file);
      totals.set(current, totals.get(current) - ownDegree);
      const weights = new Map();
      for (const [other, weight] of weightedNeighbors.get(file)) {
        const group = community.get(other);
        weights.set(group, (weights.get(group) || 0) + weight);
      }
      let best = current;
      let bestScore = (weights.get(current) || 0) - ownDegree * totals.get(current) / totalWeight;
      for (const [group, weight] of weights) {
        const score = weight - ownDegree * totals.get(group) / totalWeight;
        if (score > bestScore + 1e-7) { best = group; bestScore = score; }
      }
      community.set(file, best);
      totals.set(best, totals.get(best) + ownDegree);
      if (best !== current) moved++;
    }
    if (!moved) break;
  }
  const groups = new Map();
  for (const file of component) {
    const group = community.get(file);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(file);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}
function clusterLayout() {
  const components = connectedComponents().flatMap(communitiesFor);
  const boxes = [];
  for (const component of components) {
    const files = [...component].sort((a, b) =>
      neighbors.get(b).size - neighbors.get(a).size || a.localeCompare(b));
    const index = new Map(files.map((file, i) => [file, i]));
    const spacing = Math.max(96, files.reduce((sum, file) => sum + geometry(file).radius * 2 + 24, 0) / files.length);
    const points = files.map((file, i) => {
      const angle = i * 2.399963229728653;
      const distance = spacing * Math.sqrt(i);
      return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance,
        radius: geometry(file).radius, vx: 0, vy: 0 };
    });
    const links = connections.filter(link => index.has(link.a) && index.has(link.b))
      .map(link => ({ a: index.get(link.a), b: index.get(link.b), weight: link.weight }));
    const linkDegree = new Float64Array(files.length);
    for (const { a, b, weight } of links) { linkDegree[a] += weight; linkDegree[b] += weight; }
    for (let step = 0; step < 130 && files.length > 1; step++) {
      const fx = new Float64Array(files.length), fy = new Float64Array(files.length);
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dx = points[j].x - points[i].x, dy = points[j].y - points[i].y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > 250000) continue;
          const dist = Math.max(1, Math.sqrt(distanceSquared));
          const gap = points[i].radius + points[j].radius + 24;
          const force = 18000 / Math.max(distanceSquared, 1600) + Math.max(0, gap - dist) * 0.35;
          const x = force * dx / dist, y = force * dy / dist;
          fx[i] -= x; fy[i] -= y; fx[j] += x; fy[j] += y;
        }
      }
      for (const { a, b, weight } of links) {
        const dx = points[b].x - points[a].x, dy = points[b].y - points[a].y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const preferred = points[a].radius + points[b].radius + 35 + 80 / Math.sqrt(weight);
        const strength = 0.06 * weight / Math.sqrt(linkDegree[a] * linkDegree[b]);
        const force = strength * (dist - preferred);
        const x = force * dx / dist, y = force * dy / dist;
        fx[a] += x; fy[a] += y; fx[b] -= x; fy[b] -= y;
      }
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        point.vx = (point.vx + fx[i] - point.x * 0.002) * 0.72;
        point.vy = (point.vy + fy[i] - point.y * 0.002) * 0.72;
        point.x += Math.max(-22, Math.min(22, point.vx));
        point.y += Math.max(-22, Math.min(22, point.vy));
      }
    }
    for (let pass = 0; pass < 120; pass++) {
      let overlaps = 0;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dx = points[j].x - points[i].x, dy = points[j].y - points[i].y;
          const gap = points[i].radius + points[j].radius + 24;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= gap * gap) continue;
          overlaps++;
          const dist = Math.sqrt(distanceSquared);
          const angle = dist < 0.01 ? (i + j + 1) * 2.399963229728653 : 0;
          const ux = dist < 0.01 ? Math.cos(angle) : dx / dist;
          const uy = dist < 0.01 ? Math.sin(angle) : dy / dist;
          const shift = (gap - dist) * 0.51;
          points[i].x -= shift * ux; points[i].y -= shift * uy;
          points[j].x += shift * ux; points[j].y += shift * uy;
        }
      }
      if (!overlaps) break;
    }
    let minimumRatio = 1;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const gap = points[i].radius + points[j].radius + 24;
        const dist = Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
        minimumRatio = Math.min(minimumRatio, dist / gap);
      }
    }
    if (minimumRatio < 1) {
      const scale = 1.001 / Math.max(minimumRatio, 0.01);
      for (const point of points) { point.x *= scale; point.y *= scale; }
    }
    const left = Math.min(...points.map(p => p.x - p.radius));
    const top = Math.min(...points.map(p => p.y - p.radius));
    const right = Math.max(...points.map(p => p.x + p.radius));
    const bottom = Math.max(...points.map(p => p.y + p.radius));
    boxes.push({ files, points, left, top, width: right - left, height: bottom - top });
  }
  const area = boxes.reduce((sum, box) => sum + box.width * box.height, 0);
  const rowWidth = Math.max(boxes[0]?.width || 0, Math.sqrt(area) * 1.5);
  let x = 0, y = 0, rowHeight = 0;
  for (const box of boxes) {
    if (x && x + box.width > rowWidth) { x = 0; y += rowHeight + 220; rowHeight = 0; }
    box.files.forEach((file, i) => {
      const point = box.points[i];
      positions.set(file, { x: x + point.x - box.left, y: y + point.y - box.top,
        radius: point.radius });
    });
    x += box.width + 220;
    rowHeight = Math.max(rowHeight, box.height);
  }
}
function layout() {
  positions = new Map();
  declPositions = new Map();
  if (clusterMode) clusterLayout(); else dependencyLayout();
  for (const file of expanded) {
    const parent = positions.get(file);
    if (!parent) continue;
    const { columns, rows } = geometry(file);
    for (const [index, decl] of (byFile.get(file) || []).entries()) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      declPositions.set(decl.id, {
        x: parent.x + (col - (columns - 1) / 2) * 126 - 48,
        y: parent.y + (row - (rows - 1) / 2) * 34 + 12
      });
    }
  }
}
function line(source, target, sourceRadius, targetRadius) {
  const dx = target.x - source.x, dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  const x1 = source.x + ux * sourceRadius, y1 = source.y + uy * sourceRadius;
  const x2 = target.x - ux * targetRadius, y2 = target.y - uy * targetRadius;
  if (Math.hypot(x2 - x1, y2 - y1) < 7) return null;
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}
function declarationEdgeHighlight(examples) {
  let incoming = false, outgoing = false, file = false;
  for (const edge of examples) {
    incoming ||= highlightedDeclarations.has(edge.target) && !supportRoots.has(edge.target);
    outgoing ||= highlightedDeclarations.has(edge.source) && !supportRoots.has(edge.source);
    file ||= highlightedFiles.has(declarations.get(edge.source)?.file) ||
      highlightedFiles.has(declarations.get(edge.target)?.file);
  }
  const highlighted = incoming || outgoing || file;
  const directions = `${incoming ? " incoming" : ""}${outgoing ? " outgoing" : ""}`;
  const marker = incoming && outgoing ? "url(#arrow-both)" :
    incoming ? "url(#arrow-incoming)" :
    outgoing ? "url(#arrow-outgoing)" : "url(#arrow-highlight)";
  return { highlighted, directions, marker };
}
function fileUsagePairs() {
  if (cachedFileUsagePairs) return cachedFileUsagePairs;
  const pairs = new Map();
  for (const edge of visibleDeclarationEdges) {
    const from = declarations.get(edge.source)?.file;
    const to = declarations.get(edge.target)?.file;
    if (!from || !to || from === to) continue;
    const key = JSON.stringify([from, to]);
    if (!pairs.has(key)) pairs.set(key, { from, to, examples: [] });
    pairs.get(key).examples.push(edge);
  }
  cachedFileUsagePairs = pairs;
  return pairs;
}
function selectedNodeForDeclaration(id) {
  const decl = declarations.get(id);
  if (!decl) return null;
  if (highlightedDeclarations.has(id)) return declarationRef(id);
  if (highlightedFiles.has(decl.file)) return fileRef(decl.file);
  return null;
}
function renderSelectedConnections() {
  const entries = new Map();
  const add = (from, to, declaration, title) => {
    if (from.id === to.id && from.kind === to.kind) return;
    const key = JSON.stringify([declaration ? "declaration" : "file",
      endpointKey(from), endpointKey(to)]);
    if (!entries.has(key)) entries.set(key, { from, to, declaration, title });
  };

  // `fileLinks` is the complete directed file graph: import links plus
  // compiled declaration-use links, each pointing prerequisite -> dependent.
  // Selection order is irrelevant; every selected pair is included in its
  // true direction. When an endpoint is expanded, a file link backed by
  // declaration uses is replaced by those declaration-level arrows below.
  for (const { source, target, imports: importCount, uses } of fileLinks.values()) {
    if (!highlightedFiles.has(source) || !highlightedFiles.has(target)) continue;
    if (uses && (expanded.has(source) || expanded.has(target))) continue;
    add(fileRef(source), fileRef(target), false, importCount ?
      `${source} is imported by ${target}` : `${target} uses declarations from ${source}`);
  }

  // Expanded selected files expose every directed declaration-use edge between
  // them. A collapsed endpoint stays represented by its file node, while an
  // explicitly selected declaration remains visible even in a collapsed file.
  for (const edge of visibleDeclarationEdges) {
    const source = declarations.get(edge.source), target = declarations.get(edge.target);
    if (!source || !target) continue;
    const filesSelected = highlightedFiles.has(source.file) && highlightedFiles.has(target.file);
    const from = filesSelected ?
      (highlightedDeclarations.has(edge.source) || expanded.has(source.file) ? declarationRef(edge.source) : fileRef(source.file)) :
      selectedNodeForDeclaration(edge.source);
    const to = filesSelected ?
      (highlightedDeclarations.has(edge.target) || expanded.has(target.file) ? declarationRef(edge.target) : fileRef(target.file)) :
      selectedNodeForDeclaration(edge.target);
    if (!from || !to ||
        (from.kind === "file" && to.kind === "file" &&
          from.id === source.file && to.id === target.file)) continue;
    add(from, to, true, declarationConnectionTitle(edge));
  }

  for (const { from, to, declaration, title } of entries.values()) {
    const fromDecl = from.kind === "declaration" ? declarations.get(from.id) : null;
    const toDecl = to.kind === "declaration" ? declarations.get(to.id) : null;
    const source = fromDecl ? declPositions.get(from.id) : positions.get(from.id);
    const target = toDecl ? declPositions.get(to.id) : positions.get(to.id);
    if (!source || !target) continue;
    const path = line(source, target, fromDecl ? 7 : source.radius,
      toDecl ? 9 : target.radius + 3);
    if (!path) continue;
    const className = declaration ? "edge declaration highlight" : "edge import highlight";
    const node = element("path", { d: path, class: className,
      "marker-end": "url(#arrow-highlight)" });
    titled(node, title);
    edgesLayer.appendChild(node);
  }
}
function renderEdges() {
  edgesLayer.replaceChildren();
  if (selectionConnectionsOnly) {
    renderSelectedConnections();
    return;
  }
  const revealExpandedConnections = showAllConnections ||
    highlightedFiles.size > 0 || highlightedDeclarations.size > 0;
  const usagePairs = showAllConnections && !expanded.size ? fileUsagePairs() : new Map();
  if (usagePairs !== cachedFileUsagePairs) {
    for (const edge of visibleDeclarationEdges) {
      const source = declarations.get(edge.source), target = declarations.get(edge.target);
      if (!source || !target) continue;
      if (!revealExpandedConnections) continue;
      if (!showAllConnections && !expanded.has(source.file) && !expanded.has(target.file)) continue;
      const fromKind = expanded.has(source.file) ? "declaration" : "file";
      const toKind = expanded.has(target.file) ? "declaration" : "file";
      const from = fromKind === "declaration" ? edge.source : source.file;
      const to = toKind === "declaration" ? edge.target : target.file;
      if (from === to && fromKind === toKind) continue;
      const key = JSON.stringify([fromKind, from, toKind, to]);
      if (!usagePairs.has(key)) usagePairs.set(key, { from, to, fromKind, toKind, examples: [] });
      usagePairs.get(key).examples.push(edge);
    }
  }
  const visibleUsageFiles = new Set();
  for (const entry of usagePairs.values()) {
    const fromDecl = entry.fromKind === "declaration" ? declarations.get(entry.from) : null;
    const toDecl = entry.toKind === "declaration" ? declarations.get(entry.to) : null;
    const from = fromDecl ? declPositions.get(entry.from) : positions.get(entry.from);
    const to = toDecl ? declPositions.get(entry.to) : positions.get(entry.to);
    if (!from || !to) continue;
    const path = line(from, to, fromDecl ? 7 : from.radius, toDecl ? 9 : to.radius + 3);
    if (!path) continue;
    const highlight = declarationEdgeHighlight(entry.examples);
    if (!showAllConnections && !highlight.highlighted) continue;
    const stateClass = highlight.highlighted ? ` highlight${highlight.directions}` : "";
    const node = element("path", { d: path, class: "edge declaration" + stateClass,
      "marker-end": highlight.highlighted ? highlight.marker :
        showAllConnections ? "url(#arrow)" : "none" });
    const relationship = highlight.directions === " incoming" ? "Incoming prerequisite" :
      highlight.directions === " outgoing" ? "Outgoing dependent" :
      highlight.directions ? "Incoming and outgoing" : "Declaration use";
    titled(node, entry.examples.slice(0, 8)
      .map(edge => `${relationship}: ${declarationConnectionTitle(edge)}`).join("\n"));
    edgesLayer.appendChild(node);
    const sourceFile = fromDecl?.file || entry.from, targetFile = toDecl?.file || entry.to;
    visibleUsageFiles.add(JSON.stringify([sourceFile, targetFile]));
  }
  const importEdges = new Map();
  imports.forEachEdge((_id, _attrs, source, target) =>
    importEdges.set(JSON.stringify([source, target]), { source, target }));
  for (const edge of directImports) {
    importEdges.set(JSON.stringify([edge.source, edge.target]), edge);
  }
  if (auditMode) {
    for (const edge of importCandidates) importEdges.set(edge.key, edge);
  }
  for (const { source, target } of importEdges.values()) {
    if (visibleUsageFiles.has(JSON.stringify([source, target]))) continue;
    const from = positions.get(source), to = positions.get(target);
    if (!from || !to) continue;
    const path = line(from, to, from.radius + 2, to.radius + 5);
    if (!path) continue;
    const highlighted = highlightedFiles.has(source) || highlightedFiles.has(target);
    const candidate = auditMode && candidateKeys.has(JSON.stringify([source, target]));
    if (!showAllConnections && !highlighted && !candidate) continue;
    const stateClass = candidate ? " audit-candidate" : highlighted ? " highlight" : "";
    edgesLayer.appendChild(titled(element("path", { d: path,
      class: "edge import" + stateClass,
      "marker-end": candidate ? "url(#arrow-audit)" :
        highlighted ? "url(#arrow-highlight)" :
        showAllConnections ? "url(#arrow)" : "none" }),
      `${source} is imported by ${target}${candidate ? " — no declaration use found" : ""}`));
  }
}
function renderFiles() {
  filesLayer.replaceChildren();
  declsLayer.replaceChildren();
  const query = search.value.trim().toLowerCase();
  for (const file of modules) {
    const { x, y, radius } = positions.get(file);
    const open = expanded.has(file);
    const chosenColor = fileColor(file);
    const group = element("g", { class: "file" + (highlightedFiles.has(file) ? " selected" : "") +
      (supportFiles.has(file) ? " support" : ""),
      tabindex: "0", role: "button", "aria-label": `Show connections for ${file}`,
      "aria-pressed": String(highlightedFiles.has(file)),
      "aria-description": `Double click to ${open ? "collapse" : "expand"} declarations` });
    if (chosenColor) {
      group.style.setProperty("--file-color", chosenColor.stroke);
      group.style.setProperty("--file-fill", chosenColor.fill);
      group.style.setProperty("--file-count-color", "#24344f");
    }
    if (query && file.toLowerCase().includes(query)) group.classList.add("match");
    group.appendChild(element("circle", { cx: x, cy: y, r: radius,
      class: "file-circle" + (open ? " expanded" : "") }));
    group.appendChild(element("text", { x, y: open ? y - radius + 24 : y - 1,
      class: "file-label" }, open ? file : shortName(file)));
    if (!open) group.appendChild(element("text", { x, y: y + 16, class: "file-count" },
      `${byFile.get(file)?.length || 0} decls`));
    titled(group, file);
    group.addEventListener("click", event => {
      if (nodeActivationSuppressed() || event.detail > 1) return;
      deferNodeClick(`file:${file}`, () => selectFile(file));
    });
    group.addEventListener("dblclick", () => {
      cancelNodeClick(`file:${file}`);
      if (!nodeActivationSuppressed()) toggle(file);
    });
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); selectFile(file); }
      if (event.key === " " || (event.key === "Enter" && event.shiftKey)) {
        event.preventDefault(); toggle(file);
      }
    });
    filesLayer.appendChild(group);
    if (!open) continue;
    for (const decl of byFile.get(file) || []) {
      const p = declPositions.get(decl.id);
      const child = element("g", { class: "decl" + (highlightedDeclarations.has(decl.id) ? " selected" : "") +
        (supportRoots.has(decl.id) ? " support-root" : ""),
        tabindex: "0", role: "button", "aria-label": decl.id,
        "aria-pressed": String(highlightedDeclarations.has(decl.id)),
        "aria-description": "Double click to color files containing prerequisites" });
      if (query && (decl.id.toLowerCase().includes(query) ||
          declarationLabel(decl).toLowerCase().includes(query))) child.classList.add("match");
      child.appendChild(element("circle", { cx: p.x, cy: p.y, r: 6, fill: color(decl.kind) }));
      const short = shortName(declarationLabel(decl));
      child.appendChild(element("text", { x: p.x + 10, y: p.y },
        short.length > 17 ? short.slice(0, 16) + "…" : short));
      titled(child, `${declarationLabel(decl)} (${decl.kind})`);
      child.addEventListener("click", event => {
        event.stopPropagation();
        if (nodeActivationSuppressed() || event.detail > 1) return;
        deferNodeClick(`declaration:${decl.id}`, () => selectDeclaration(decl.id));
      });
      child.addEventListener("dblclick", event => {
        event.stopPropagation();
        cancelNodeClick(`declaration:${decl.id}`);
        if (!nodeActivationSuppressed()) traceDeclaration(decl.id);
      });
      child.addEventListener("keydown", event => {
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault(); event.stopPropagation(); traceDeclaration(decl.id);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); event.stopPropagation(); selectDeclaration(decl.id);
        }
      });
      declsLayer.appendChild(child);
    }
  }
}
function updateDetails() {
  details.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = selected?.type === "declaration" ?
    declarationName(selected.id) : selected?.id || "Explore the graph";
  details.appendChild(heading);
  const summary = document.createElement("p");
  if (!selected) summary.textContent = `${modules.length} files and ${declarations.size} declarations.`;
  else if (selected.type === "file") {
    summary.textContent = `${byFile.get(selected.id)?.length || 0} declarations in this file. ${selectionOrder.length} node${selectionOrder.length === 1 ? "" : "s"} highlighted.`;
  } else {
    const decl = declarations.get(selected.id);
    summary.textContent = `${decl.kind} in ${decl.file}. ${supportRoots.has(selected.id) ?
      `${supportFiles.size} supporting file${supportFiles.size === 1 ? "" : "s"} colored.` :
      "Showing visible connections, including paths through hidden declarations."}`;
  }
  details.appendChild(summary);
  if (selected?.type !== "declaration") return;
  const uses = [...(visibleIncomingEdges.get(selected.id) || [])]
    .sort((a, b) => a.source.localeCompare(b.source));
  const users = [...(visibleOutgoingEdges.get(selected.id) || [])]
    .sort((a, b) => a.target.localeCompare(b.target));
  for (const [label, values, direction, endpoint] of
      [["Uses", uses, "incoming", "source"], ["Used by", users, "outgoing", "target"]]) {
    const title = document.createElement("h3");
    title.textContent = `${label} (${values.length})`;
    title.className = `connection-heading ${direction}`;
    details.appendChild(title);
    const list = document.createElement("ul");
    for (const edge of values) {
      const item = document.createElement("li");
      item.textContent = declarationName(edge[endpoint]) +
        (edge.via.length ? " (via hidden declarations)" : "");
      item.title = declarationConnectionTitle(edge);
      list.appendChild(item);
    }
    details.appendChild(list);
  }
}
function render() { renderEdges(); renderFiles(); updateDetails(); }
// Keep pointer targets intact between the two clicks of a double click.
function renderSelection() {
  for (const node of filesLayer.children) {
    const file = node.querySelector("title").textContent;
    node.classList.toggle("selected", highlightedFiles.has(file));
    node.setAttribute("aria-pressed", String(highlightedFiles.has(file)));
  }
  for (const node of declsLayer.children) {
    const id = node.getAttribute("aria-label");
    node.classList.toggle("selected", highlightedDeclarations.has(id));
    node.setAttribute("aria-pressed", String(highlightedDeclarations.has(id)));
  }
  renderEdges(); updateDetails();
}
function fit() {
  if (!positions.size) return;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const { x, y, radius } of positions.values()) {
    left = Math.min(left, x - radius); top = Math.min(top, y - radius);
    right = Math.max(right, x + radius); bottom = Math.max(bottom, y + radius);
  }
  const width = right - left + 120, height = bottom - top + 120;
  const ratio = svg.clientWidth / Math.max(1, svg.clientHeight);
  const viewWidth = Math.max(width, height * ratio);
  const viewHeight = Math.max(height, width / ratio);
  view = { x: (left + right - viewWidth) / 2, y: (top + bottom - viewHeight) / 2,
    w: viewWidth, h: viewHeight };
  applyView();
}
function applyView() {
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  svg.classList.toggle("show-labels", svg.clientWidth / view.w >= 0.55);
}
function focus() {
  if (!positions.size) return;
  const focused = [...expanded].map(file => positions.get(file)).filter(Boolean);
  if (!focused.length) {
    const first = [...positions.values()].sort((a, b) => b.y - a.y || a.x - b.x)[0];
    const ratio = svg.clientWidth / Math.max(1, svg.clientHeight);
    const height = 600 / ratio;
    view = { x: first.x - 300, y: first.y - height * 0.78, w: 600, h: height };
  } else {
    const left = Math.min(...focused.map(p => p.x - p.radius));
    const right = Math.max(...focused.map(p => p.x + p.radius));
    const top = Math.min(...focused.map(p => p.y - p.radius));
    const bottom = Math.max(...focused.map(p => p.y + p.radius));
    const ratio = svg.clientWidth / Math.max(1, svg.clientHeight);
    const width = Math.max(700, right - left + 160);
    const height = Math.max(bottom - top + 160, width / ratio);
    view = { x: (left + right - height * ratio) / 2, y: (top + bottom - height) / 2,
      w: height * ratio, h: height };
  }
  applyView();
}
function focusSupportFiles() {
  const files = new Set(supportFiles);
  for (const root of supportRoots) files.add(declarations.get(root)?.file);
  const focused = [...files].map(file => positions.get(file)).filter(Boolean);
  if (!focused.length) { focus(); return; }
  const left = Math.min(...focused.map(p => p.x - p.radius));
  const right = Math.max(...focused.map(p => p.x + p.radius));
  const top = Math.min(...focused.map(p => p.y - p.radius));
  const bottom = Math.max(...focused.map(p => p.y + p.radius));
  const ratio = svg.clientWidth / Math.max(1, svg.clientHeight);
  const width = Math.max(700, right - left + 160);
  const height = Math.max(bottom - top + 160, width / ratio);
  view = { x: (left + right - height * ratio) / 2,
    y: (top + bottom - height) / 2, w: height * ratio, h: height };
  applyView();
}
function toggle(file) {
  if (expanded.has(file)) expanded.delete(file); else expanded.add(file);
  // Preserve file selection while expanding so selected pairs keep their
  // file-level and declaration-level connections visible.
  layout(); render(); centerOn(file);
}
function setSelection(type, id, active) {
  const set = type === "file" ? highlightedFiles : highlightedDeclarations;
  const index = selectionOrder.findIndex(item => item.type === type && item.id === id);
  if (index >= 0) selectionOrder.splice(index, 1);
  if (active) {
    set.add(id);
    selectionOrder.push({ type, id });
  } else set.delete(id);
  selected = selectionOrder.at(-1) || null;
}
function selectFile(file, center = false) {
  setSelection("file", file, !highlightedFiles.has(file));
  renderSelection();
  if (center) centerOn(file);
}
function selectDeclaration(id) {
  const active = !highlightedDeclarations.has(id);
  setSelection("declaration", id, active);
  renderSelection();
}
function traceDeclaration(id) {
  if (supportRoots.has(id)) {
    supportRoots.delete(id);
    setSelection("declaration", id, false);
  } else {
    supportRoots.add(id);
    setSelection("declaration", id, true);
  }
  rebuildSupportFiles();
  renderDirectoryTree();
  render();
  if (supportRoots.size) focusSupportFiles();
  else centerOn(declarations.get(id).file);
}
function centerOn(file) {
  const point = positions.get(file);
  if (!point) return;
  const width = Math.max(600, point.radius * 2 + 180);
  const height = width * svg.clientHeight / Math.max(1, svg.clientWidth);
  view = { x: point.x - width / 2, y: point.y - height / 2, w: width, h: height };
  applyView();
}
function graphPoint(event) {
  const rect = svg.getBoundingClientRect();
  return { x: view.x + (event.clientX - rect.left) / rect.width * view.w,
    y: view.y + (event.clientY - rect.top) / rect.height * view.h };
}
let drag = null;
let suppressNodeActivation = false;
const dragThreshold = 4;
function nodeActivationSuppressed() { return suppressNodeActivation; }
svg.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0) return;
  suppressNodeActivation = false;
  drag = { x: event.clientX, y: event.clientY, view: { ...view },
    pointerId: event.pointerId, moved: false };
});
svg.addEventListener("pointermove", event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < dragThreshold) {
    return;
  }
  if (!drag.moved) {
    drag.moved = true;
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("dragging");
  }
  view.x = drag.view.x - (event.clientX - drag.x) / svg.clientWidth * view.w;
  view.y = drag.view.y - (event.clientY - drag.y) / svg.clientHeight * view.h;
  applyView();
});
function finishDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (drag.moved) suppressNodeActivation = true;
  drag = null;
  svg.classList.remove("dragging");
}
window.addEventListener("pointerup", finishDrag);
window.addEventListener("pointercancel", finishDrag);
svg.addEventListener("lostpointercapture", finishDrag);
svg.addEventListener("wheel", event => {
  event.preventDefault();
  const at = graphPoint(event), factor = Math.exp(event.deltaY * 0.001);
  const newWidth = Math.max(80, Math.min(100000, view.w * factor));
  const scale = newWidth / view.w;
  view.x = at.x - (at.x - view.x) * scale;
  view.y = at.y - (at.y - view.y) * scale;
  view.w = newWidth; view.h *= scale; applyView();
}, { passive: false });
document.getElementById("fit").addEventListener("click", fit);
const clusterButton = document.getElementById("cluster-view");
function updateClusterButton() {
  clusterButton.setAttribute("aria-pressed", String(clusterMode));
  clusterButton.setAttribute("aria-label", clusterMode ? "Show dependency layout" : "Show cluster graph");
  clusterButton.title = clusterMode ? "Show dependency layout" : "Show cluster graph";
  svg.classList.toggle("cluster-mode", clusterMode);
}
clusterButton.addEventListener("click", () => {
  clusterMode = !clusterMode;
  updateClusterButton();
  layout(); render();
  if (clusterMode) fit();
  else if (selected?.type === "file") centerOn(selected.id);
  else focus();
});
const showAllButton = document.getElementById("show-all");
function updateShowAllButton() {
  showAllButton.setAttribute("aria-pressed", String(showAllConnections));
  showAllButton.setAttribute("aria-label", showAllConnections ? "Hide all connections" : "Show all connections");
  showAllButton.title = showAllConnections ? "Hide all connections" : "Show all connections";
  svg.classList.toggle("show-all", showAllConnections);
}
showAllButton.addEventListener("click", () => {
  showAllConnections = !showAllConnections;
  updateShowAllButton();
  renderEdges();
});
const selectionConnectionsButton = document.getElementById("selection-connections");
function updateSelectionConnectionsButton() {
  selectionConnectionsButton.setAttribute("aria-pressed", String(selectionConnectionsOnly));
  const label = selectionConnectionsOnly ? "Show normal connections" :
    "Show only connections between selected nodes";
  selectionConnectionsButton.setAttribute("aria-label", label);
  selectionConnectionsButton.title = label;
}
selectionConnectionsButton.addEventListener("click", () => {
  selectionConnectionsOnly = !selectionConnectionsOnly;
  updateSelectionConnectionsButton();
  renderEdges();
});
const auditButton = document.getElementById("import-audit-button");
function updateAuditButton() {
  auditButton.setAttribute("aria-pressed", String(auditMode));
  auditButton.title = auditMode ? "Hide file decoupling" : "Show file decoupling";
  importAudit.hidden = !auditMode;
  document.querySelector("aside").classList.toggle("audit-active", auditMode);
}
function renderImportAudit() {
  importAudit.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = `File decoupling (${importCandidates.length})`;
  importAudit.appendChild(heading);
  const explanation = document.createElement("p");
  explanation.textContent = "These direct imports have no cross-file declaration use in the compiled graph. Check syntax, instances, tactics, and other effects before removing an import.";
  importAudit.appendChild(explanation);
  const table = document.createElement("table");
  table.className = "audit-table";
  const head = table.createTHead().insertRow();
  for (const label of ["File", "Unused import"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    head.appendChild(cell);
  }
  const body = table.createTBody();
  for (const { source, target } of importCandidates) {
    const row = body.insertRow();
    const fileCell = row.insertCell();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = target;
    button.title = `${target} imports ${source}`;
    button.addEventListener("click", () => {
      setSelection("file", target, true);
      render(); centerOn(target);
    });
    fileCell.appendChild(button);
    const importCell = row.insertCell();
    importCell.textContent = source;
  }
  importAudit.appendChild(table);
}

const sinksPanel = document.getElementById("theorem-sinks");
const sinksButton = document.getElementById("theorem-sinks-button");
let sinksMode = false;
const sidebarSplitters = [
  document.getElementById("splitter-directory"),
  document.getElementById("splitter-audit"),
  document.getElementById("splitter-sinks")
];
let sidebarPanels = [];
let sidebarFractions = [];
const sidebarSplitterHeight = 4;
function sidebarAvailableHeight() {
  return Math.max(1, sidebar.clientHeight - sidebarSplitterHeight * (sidebarPanels.length - 1));
}
function applySidebarFractions() {
  const gaps = sidebarSplitterHeight * (sidebarPanels.length - 1);
  sidebarPanels.forEach((panel, index) => {
    const share = sidebarFractions[index];
    panel.style.flex = `0 0 calc(${share * 100}% - ${share * gaps}px)`;
  });
  const available = sidebarAvailableHeight();
  sidebarPanels.slice(0, -1).forEach((panel, index) => {
    const splitter = panel.nextElementSibling;
    const pair = sidebarFractions[index] + sidebarFractions[index + 1];
    const min = Math.min(60 / available, pair / 3);
    splitter.setAttribute("aria-valuemin", String(Math.round(min * available)));
    splitter.setAttribute("aria-valuemax", String(Math.round((pair - min) * available)));
    splitter.setAttribute("aria-valuenow", String(Math.round(sidebarFractions[index] * available)));
    splitter.setAttribute("aria-valuetext", `${panel.getAttribute("aria-label")} ${Math.round(sidebarFractions[index] * available)} pixels high`);
  });
}
function updateSidebarLayout() {
  sidebarPanels = [document.querySelector(".directory-panel")];
  if (auditMode) sidebarPanels.push(importAudit);
  if (sinksMode) sidebarPanels.push(sinksPanel);
  sidebarPanels.push(details);
  sidebarSplitters[0].hidden = false;
  sidebarSplitters[1].hidden = !auditMode;
  sidebarSplitters[2].hidden = !sinksMode;
  sidebarFractions = sidebarPanels.length === 2 ? [0.58, 0.42] :
    sidebarPanels.length === 3 ? [0.35, 0.35, 0.30] : [0.28, 0.24, 0.24, 0.24];
  applySidebarFractions();
}
function setSidebarPair(index, first, initial = sidebarFractions) {
  const pair = initial[index] + initial[index + 1];
  const min = Math.min(60 / sidebarAvailableHeight(), pair / 3);
  const clamped = Math.max(min, Math.min(pair - min, first));
  sidebarFractions = [...initial];
  sidebarFractions[index] = clamped;
  sidebarFractions[index + 1] = pair - clamped;
  applySidebarFractions();
}
let sidebarDrag = null;
for (const splitter of sidebarSplitters) {
  splitter.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    const index = sidebarPanels.findIndex(panel => panel.nextElementSibling === splitter);
    if (index < 0) return;
    sidebarDrag = { pointerId: event.pointerId, index, y: event.clientY,
      fractions: [...sidebarFractions] };
    splitter.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-sidebar");
    event.preventDefault();
  });
  splitter.addEventListener("pointermove", event => {
    if (!sidebarDrag || event.pointerId !== sidebarDrag.pointerId) return;
    const { index, y, fractions } = sidebarDrag;
    setSidebarPair(index, fractions[index] + (event.clientY - y) / sidebarAvailableHeight(), fractions);
  });
  const finish = event => {
    if (!sidebarDrag || event.pointerId !== sidebarDrag.pointerId) return;
    sidebarDrag = null;
    document.body.classList.remove("resizing-sidebar");
  };
  splitter.addEventListener("pointerup", finish);
  splitter.addEventListener("pointercancel", finish);
  splitter.addEventListener("lostpointercapture", finish);
  splitter.addEventListener("keydown", event => {
    const index = sidebarPanels.findIndex(panel => panel.nextElementSibling === splitter);
    if (index < 0) return;
    const step = (event.shiftKey ? 50 : 10) / sidebarAvailableHeight();
    let first = sidebarFractions[index];
    if (event.key === "ArrowUp") first -= step;
    else if (event.key === "ArrowDown") first += step;
    else if (event.key === "Home") first = 0;
    else if (event.key === "End") first = 1;
    else return;
    event.preventDefault();
    setSidebarPair(index, first);
  });
}
function updateSinksButton() {
  sinksButton.setAttribute("aria-pressed", String(sinksMode));
  sinksButton.title = sinksMode ? "Hide theorem sinks" : "Show theorem sinks";
  sinksPanel.hidden = !sinksMode;
  document.querySelector("aside").classList.toggle("sinks-active", sinksMode);
}
function renderTheoremSinks() {
  sinksPanel.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = `Theorem sinks (${theoremSinks.length})`;
  sinksPanel.appendChild(heading);
  const explanation = document.createElement("p");
  explanation.textContent = "Source theorems with no other visible declaration using them, directly or through hidden helpers or filtered files. Generated theorems and structure fields are excluded.";
  sinksPanel.appendChild(explanation);
  if (!theoremSinks.length) return;
  const sinkTable = document.createElement("table");
  sinkTable.className = "audit-table sink-table";
  const sinkHead = sinkTable.createTHead().insertRow();
  for (const label of ["Theorem", "File"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    sinkHead.appendChild(cell);
  }
  const sinkBody = sinkTable.createTBody();
  for (const theorem of theoremSinks) {
    const row = sinkBody.insertRow();
    const theoremCell = row.insertCell();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = declarationLabel(theorem);
    button.title = `Show ${declarationLabel(theorem)}`;
    button.addEventListener("click", () => {
      expanded.add(theorem.file);
      setSelection("file", theorem.file, true);
      setSelection("declaration", theorem.id, true);
      layout(); render(); centerOn(theorem.file);
    });
    theoremCell.appendChild(button);
    row.insertCell().textContent = theorem.file;
  }
  sinksPanel.appendChild(sinkTable);
}

auditButton.addEventListener("click", () => {
  auditMode = !auditMode;
  updateAuditButton();
  updateSidebarLayout();
  renderEdges();
});
sinksButton.addEventListener("click", () => {
  sinksMode = !sinksMode;
  updateSinksButton();
  updateSidebarLayout();
});
renderImportAudit();
updateAuditButton();
renderTheoremSinks();
updateSinksButton();
updateSidebarLayout();
document.getElementById("clear-colors").addEventListener("click", () => {
  folderSelections.clear();
  fileSelections.clear();
  for (const id of [...supportRoots]) setSelection("declaration", id, false);
  supportRoots.clear();
  rebuildSupportFiles();
  renderDirectoryTree(); render();
});
document.getElementById("reset-view").addEventListener("click", () => {
  expanded.clear();
  highlightedFiles.clear(); highlightedDeclarations.clear(); selectionOrder.length = 0;
  supportRoots.clear(); rebuildSupportFiles();
  selected = null;
  folderSelections.clear();
  fileSelections.clear();
  openFolders.clear();
  for (const folder of defaultOpenFolders) openFolders.add(folder);
  search.value = "";
  clusterMode = false;
  updateClusterButton();
  showAllConnections = false;
  updateShowAllButton();
  selectionConnectionsOnly = false;
  updateSelectionConnectionsButton();
  auditMode = false;
  updateAuditButton();
  sinksMode = false;
  updateSinksButton();
  updateSidebarLayout();
  renderDirectoryTree(); layout(); render(); focus();
});
search.addEventListener("input", () => {
  const query = search.value.trim().toLowerCase();
  if (!query) { render(); return; }
  const matchedFile = modules.find(file => file.toLowerCase().includes(query));
  const matchedDecl = matchedFile ? null : DECLARATIONS.nodes.find(decl =>
    decl.id.toLowerCase().includes(query) || declarationLabel(decl).toLowerCase().includes(query));
  if (matchedFile || matchedDecl) {
    const file = matchedFile || matchedDecl.file;
    if (matchedDecl) {
      expanded.add(file);
      setSelection("declaration", matchedDecl.id, true);
      layout();
    } else setSelection("file", file, true);
    render(); centerOn(file);
  } else {
    render();
  }
});
window.addEventListener("resize", () => { if (clusterMode) fit(); else focus(); });

// Resize the graph and details panes without interfering with graph panning.
// The same separator becomes horizontal on narrow screens.
let layoutDrag = null;
const layoutDragThreshold = 2;
function narrowLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}
function layoutSizeLimits(horizontal) {
  const rect = layoutElement.getBoundingClientRect();
  if (horizontal) {
    return { min: 140, max: Math.max(140, rect.height - 120), available: rect.height };
  }
  return { min: 240, max: Math.max(240, Math.min(rect.width * 0.65, rect.width - 220)), available: rect.width };
}
function clampLayoutSize(value, horizontal) {
  const limits = layoutSizeLimits(horizontal);
  return Math.round(Math.max(limits.min, Math.min(limits.max, value)));
}
function setLayoutSize(value, horizontal = narrowLayout()) {
  const size = clampLayoutSize(value, horizontal);
  if (horizontal) {
    layoutElement.style.removeProperty("--aside-width");
    layoutElement.style.gridTemplateRows = `minmax(0, 1fr) 4px ${size}px`;
    layoutSplitter.setAttribute("aria-orientation", "horizontal");
    layoutSplitter.setAttribute("aria-valuemin", "140");
    layoutSplitter.setAttribute("aria-valuemax", String(layoutSizeLimits(true).max));
  } else {
    layoutElement.style.removeProperty("grid-template-rows");
    layoutElement.style.setProperty("--aside-width", `${size}px`);
    layoutSplitter.setAttribute("aria-orientation", "vertical");
    layoutSplitter.setAttribute("aria-valuemin", "240");
    layoutSplitter.setAttribute("aria-valuemax", String(layoutSizeLimits(false).max));
  }
  layoutSplitter.setAttribute("aria-valuenow", String(size));
  layoutSplitter.setAttribute("aria-valuetext", horizontal ?
    `Details pane ${size} pixels high` : `Details pane ${size} pixels wide`);
  if (view) applyView();
}
function layoutPointerSize(event, horizontal) {
  const rect = layoutElement.getBoundingClientRect();
  return horizontal ? rect.bottom - event.clientY : rect.right - event.clientX;
}
layoutSplitter.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0) return;
  const horizontal = narrowLayout();
  layoutDrag = { pointerId: event.pointerId, horizontal,
    start: layoutPointerSize(event, horizontal), moved: false };
  layoutSplitter.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing-layout");
  event.preventDefault();
});
layoutSplitter.addEventListener("pointermove", event => {
  if (!layoutDrag || event.pointerId !== layoutDrag.pointerId) return;
  const size = layoutPointerSize(event, layoutDrag.horizontal);
  if (!layoutDrag.moved && Math.abs(size - layoutDrag.start) < layoutDragThreshold) return;
  layoutDrag.moved = true;
  setLayoutSize(size, layoutDrag.horizontal);
});
function finishLayoutDrag(event) {
  if (!layoutDrag || event.pointerId !== layoutDrag.pointerId) return;
  layoutDrag = null;
  document.body.classList.remove("resizing-layout");
}
layoutSplitter.addEventListener("pointerup", finishLayoutDrag);
layoutSplitter.addEventListener("pointercancel", finishLayoutDrag);
layoutSplitter.addEventListener("lostpointercapture", finishLayoutDrag);
layoutSplitter.addEventListener("keydown", event => {
  const horizontal = narrowLayout();
  const current = Number(layoutSplitter.getAttribute("aria-valuenow")) || (horizontal ? 160 : 330);
  const step = event.shiftKey ? 50 : 10;
  let next = current;
  if ((!horizontal && event.key === "ArrowLeft") || (horizontal && event.key === "ArrowUp")) next -= step;
  if ((!horizontal && event.key === "ArrowRight") || (horizontal && event.key === "ArrowDown")) next += step;
  if (event.key === "Home") next = layoutSizeLimits(horizontal).min;
  if (event.key === "End") next = layoutSizeLimits(horizontal).max;
  if (next === current) return;
  event.preventDefault();
  setLayoutSize(next, horizontal);
});
window.addEventListener("resize", () => {
  if (layoutDrag) return;
  const horizontal = narrowLayout();
  setLayoutSize(Number(layoutSplitter.getAttribute("aria-valuenow")) || (horizontal ? 160 : 330), horizontal);
  applySidebarFractions();
});
const initialNarrowLayout = narrowLayout();
setLayoutSize(initialNarrowLayout ? 160 : 330, initialNarrowLayout);
updateSelectionConnectionsButton();
renderDirectoryTree(); layout(); render(); focus();
