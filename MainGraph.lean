module

public import Cli.Basic
import ImportGraph.Export.DotFile
import ImportGraph.Export.Gexf
import ImportGraph.Graph.Filter
import ImportGraph.Imports.FromSource
import ImportGraph.Imports.ImportGraph
import ImportGraph.Imports.RequiredModules
import ImportGraph.Lean.Name
import ImportGraph.Util.CurrentModule
import ImportGraph.Util.FindSorry
import Lean.Data.NameMap.AdditionalOperations
import Lean.Data.Json
import Lean.Meta.Match.MatcherInfo

/-!
# `lake exe graph`

This is a replacement for Lean 3's `leanproject import-graph` tool.
-/

open Cli

open Lean Core System ImportGraph

/-- Terminal progress display for the comparatively expensive HTML graph export. -/
private structure GraphProgress where
  stream : IO.FS.Stream
  isTty : Bool
  lastPercent : IO.Ref Nat

private def GraphProgress.start : IO GraphProgress := do
  let stream ← IO.getStderr
  return { stream, isTty := ← stream.isTty, lastPercent := ← IO.mkRef 101 }

private def repeatChar (count : Nat) (char : Char) : String :=
  String.ofList (List.replicate count char)

/-- Redraw one terminal row without wrapping long labels onto additional rows. -/
private def GraphProgress.redraw (progress : GraphProgress) (line : String) : IO Unit := do
  -- Restore automatic wrapping immediately, including before the final newline.
  -- A narrow terminal clips the label instead of leaving stale progress rows behind.
  progress.stream.putStr s!"\x1B[?7l\r\x1B[2K{line}\x1B[?7h"
  progress.stream.flush

private def GraphProgress.render (progress : GraphProgress) (percent : Nat)
    (label : String) : IO Unit := do
  let percent := min percent 100
  let previous ← progress.lastPercent.get
  if progress.isTty then
    let width := 24
    let filled := percent * width / 100
    let bar := repeatChar filled '=' ++ repeatChar (width - filled) '-'
    progress.redraw s!"[{bar}] {percent}% {label}"
  else if previous != percent then
    progress.stream.putStr s!"[{percent}%] {label}\n"
    progress.stream.flush
  progress.lastPercent.set percent

/-- Display honest indeterminate progress while Lean loads an environment without a progress API. -/
private def GraphProgress.renderLoading (progress : GraphProgress) (tick : Nat)
    (label : String) : IO Unit := do
  if progress.isTty then
    let width := 24
    let markerWidth := 5
    let period := 2 * (width - markerWidth)
    let offset := tick % period
    let position := if offset ≤ width - markerWidth then offset else period - offset
    let bar := repeatChar position '-' ++ repeatChar markerWidth '=' ++
      repeatChar (width - position - markerWidth) '-'
    progress.redraw s!"[{bar}] --% {label} ({tick / 5}s)"
  else if tick == 0 then
    progress.stream.putStr s!"[--%] {label}\n"
    progress.stream.flush

private def GraphProgress.finish (progress : GraphProgress) : IO Unit := do
  if progress.isTty then
    progress.stream.putStr "\n"
    progress.stream.flush

/-- The kinds shown inside expanded file nodes. -/
private def declarationKind (ci : ConstantInfo) : String :=
  match ci with
  | .thmInfo _ => "theorem"
  | .defnInfo _ => "definition"
  | .axiomInfo _ => "axiom"
  | .opaqueInfo _ => "opaque"
  | .inductInfo _ => "inductive"
  | .ctorInfo _ => "constructor"
  | .recInfo _ => "recursor"
  | .quotInfo _ => "quotient"

/-- Keep public declarations and user-authored private declarations visible while
    routing generated equation and matcher details through the support graph. -/
private def isUserAuthoredPrivateName (name : Name) : Bool :=
  isPrivateName name &&
    !((privateToUserName name).components.any (fun component => component.isInternalDetail))

private def isVisibleDeclarationName (name : Name) : Bool :=
  !name.isInternal || isUserAuthoredPrivateName name

/-- Match the declaration filter used by the package GEXF exporter. -/
private def isGexfBlacklisted (env : Environment) (name : Name) : Bool :=
  name == ``sorryAx ||
    name matches .str _ "inj" ||
    name matches .str _ "noConfusionType" ||
    (name.isInternalDetail && !isUserAuthoredPrivateName name) ||
    Lean.isAuxRecursor env name ||
    Lean.isNoConfusion env name ||
    Lean.isRecCore env name ||
    Lean.Meta.isMatcherCore env name

private def gexfNode (name module : Name) (size : Nat) : String :=
  s!"<node id=\"{name}\" label=\"{name}\"><attvalues><attvalue for=\"0\" value=\"{size}\" />" ++
    s!"<attvalue for=\"1\" value=\"{module.isPrefixOf name}\" /></attvalues></node>\n          "

private def gexfEdge (source target : Name) : String :=
  s!"<edge source=\"{source}\" target=\"{target}\" id=\"{source}--{target}\" />\n          "

/-- Create the GEXF file while reporting progress through declaration counting. -/
private def graphToGexf (graph : NameMap (Array Name)) (module : Name)
    (env : Environment) (progress : GraphProgress) : IO String := do
  let declarations := env.const2ModIdx.toList
  let total := declarations.length
  let checkpoint := max 1 (total / 100)
  let mut sizes : NameMap Nat := {}
  let mut index := 0
  for (name, moduleIndex) in declarations do
    index := index + 1
    if index % checkpoint == 0 || index == total then
      progress.render (26 + 5 * index / max 1 total)
        s!"Counting declarations ({index}/{total})"
    if isGexfBlacklisted env name then continue
    let moduleName := env.allImportedModuleNames[moduleIndex]!
    sizes := sizes.insert moduleName ((sizes.getD moduleName 0) + 1)
  let nodes := graph.foldl (fun output name _ =>
    output ++ gexfNode name module (sizes.getD name 0)) ""
  let edges := graph.foldl (fun output target dependencies =>
    output ++ dependencies.foldl (fun result source => result ++ gexfEdge source target) "") ""
  return "<?xml version='1.0' encoding='utf-8'?>\n" ++
    "    <gexf xmlns=\"http://www.gexf.net/1.2draft\" " ++
    "xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" " ++
    "xsi:schemaLocation=\"http://www.gexf.net/1.2draft " ++
    "http://www.gexf.net/1.2draft/gexf.xsd\" version=\"1.2\">\n" ++
    s!"      <meta>
        <creator>Lean ImportGraph</creator>
      </meta>
      <graph defaultedgetype=\"directed\" mode=\"static\" name=\"\">
        <attributes mode=\"static\" class=\"node\">
          <attribute id=\"0\" title=\"decl_count\" type=\"long\" />
          <attribute id=\"1\" title=\"in_module\" type=\"boolean\" />
        </attributes>
        <nodes>
          {nodes.trimAscii}
        </nodes>
        <edges>
          {edges.trimAscii}
        </edges>
      </graph>
    </gexf>
    "

/-- Extract direct declaration uses and file-decoupling candidates from the loaded environment.
    Declaration edges point from a used declaration to the declaration that uses it. -/
private def declarationGraphData (env : Environment) (modules : NameMap (Array Name))
    (directImports : Array (Name × Name)) (sourceFiles : Array String)
    (progress : GraphProgress) : IO (Json × Array (Name × Name)) := do
  let constants := env.constants.map₁.toList
  let total := constants.length
  let checkpoint := max 1 (total / 100)
  let mut allDeclModules : NameMap Name := {}
  let mut declModules : NameMap Name := {}
  let mut nodes : Array Json := #[]
  let mut index := 0
  for (name, ci) in constants do
    index := index + 1
    if index % checkpoint == 0 || index == total then
      progress.render (35 + 20 * index / max 1 total)
        s!"Indexing declarations ({index}/{total})"
    let some idx := env.getModuleIdxFor? name | continue
    let moduleName := env.header.moduleNames[idx.toNat]!
    if !modules.contains moduleName then continue
    allDeclModules := allDeclModules.insert name moduleName
    if !isVisibleDeclarationName name then continue
    declModules := declModules.insert name moduleName
    nodes := nodes.push <| Json.mkObj [
      ("id", Json.str name.toString),
      ("file", Json.str moduleName.toString),
      ("kind", Json.str (declarationKind ci))]

  let mut edges : Array Json := #[]
  let mut supportEdges : Array Json := #[]
  let mut supportNames : NameSet := {}
  let mut usedFilePairs : NameMap NameSet := {}
  index := 0
  for (name, ci) in constants do
    index := index + 1
    if index % checkpoint == 0 || index == total then
      progress.render (55 + 35 * index / max 1 total)
        s!"Tracing declaration uses ({index}/{total})"
    let some targetModule := allDeclModules.find? name | continue
    for used in ci.getUsedConstantsAsSet do
      if used == name then continue
      let some sourceModule := allDeclModules.find? used | continue
      let edge := Json.mkObj [
          ("source", Json.str used.toString),
          ("target", Json.str name.toString)]
      if !isVisibleDeclarationName name || !isVisibleDeclarationName used then
        supportEdges := supportEdges.push edge
        if !isVisibleDeclarationName name then supportNames := supportNames.insert name
        if !isVisibleDeclarationName used then supportNames := supportNames.insert used
      else if declModules.contains name && declModules.contains used then
        edges := edges.push edge
        if sourceModule != targetModule then
          let usedModules := (usedFilePairs.find? targetModule).getD {}
          usedFilePairs := usedFilePairs.insert targetModule (usedModules.insert sourceModule)

  let mut supportNodes : Array Json := #[]
  for (name, ci) in constants do
    if supportNames.contains name then
      let some moduleName := allDeclModules.find? name | continue
      supportNodes := supportNodes.push <| Json.mkObj [
        ("id", Json.str name.toString),
        ("file", Json.str moduleName.toString),
        ("kind", Json.str (declarationKind ci))]

  progress.render 92 "Checking file-decoupling candidates"
  let mut candidates : Array (Name × Name) := #[]
  let mut candidatePairs : NameMap NameSet := {}
  for (imported, importer) in directImports do
    let usedModules := (usedFilePairs.find? importer).getD {}
    let seenImports := (candidatePairs.find? importer).getD {}
    if !usedModules.contains imported && !seenImports.contains imported then
      candidates := candidates.push (importer, imported)
      candidatePairs := candidatePairs.insert importer (seenImports.insert imported)
  candidates := candidates.qsort fun left right =>
    left.1.toString < right.1.toString ||
      (left.1 == right.1 && left.2.toString < right.2.toString)
  let directImportsJson := directImports.map fun (source, target) => Json.mkObj [
    ("source", Json.str source.toString),
    ("target", Json.str target.toString)]
  return (Json.mkObj [
    ("nodes", Json.arr nodes),
    ("edges", Json.arr edges),
    ("supportNodes", Json.arr supportNodes),
    ("supportEdges", Json.arr supportEdges),
    ("directImports", Json.arr directImportsJson),
    ("files", Json.arr (sourceFiles.map Json.str))], candidates)

/-- Render file-decoupling candidates as the requested two-column Markdown table. -/
private def fileDecouplingMarkdown (candidates : Array (Name × Name)) : String :=
  let rows := candidates.map fun (file, imported) =>
    let path := file.toString.replace "." "/" ++ ".lean"
    s!"| `{path}` | `{imported}` |"
  "# File decoupling\n\n" ++
    "Direct project imports with no cross-file declaration use in the compiled environment. " ++
    "Review syntax, tactics, re-exports, and other elaboration-time effects before removal.\n\n" ++
    "| File | Unused import |\n| --- | --- |\n" ++
    "\n".intercalate rows.toList ++ "\n"

/-- Find Lean source files in the project even when the root module does not import them. -/
private def sourceModules (root : Name) : IO (Array String) := do
  let rootName := root.toString
  let rootDir : FilePath := rootName
  let rootFile : FilePath := rootName ++ ".lean"
  let mut files : Array String := #[]
  if ← rootFile.pathExists then
    files := files.push rootName
  if ← rootDir.isDir then
    for path in ← rootDir.walkDir do
      if path.extension == some "lean" then
        files := files.push <| ".".intercalate ((path.withExtension "").components)
  return files

/-- Find the source modules which are not imported by another module in the project tree. -/
private def projectRoots (root : Name) : IO (Array Name) := do
  let sourceFiles ← sourceModules root
  let modules := sourceFiles.map String.toName
  let moduleSet := NameSet.ofArray modules
  let mut imported : NameSet := {}
  for moduleName in modules do
    let path : FilePath := moduleName.toString.replace "." "/" ++ ".lean"
    for dependency in ← findImportsFromSource path do
      if moduleSet.contains dependency then
        imported := imported.insert dependency
  let roots := modules.filter fun moduleName => !imported.contains moduleName
  return if roots.isEmpty then #[root] else roots.qsort (·.toString < ·.toString)

/-- Locate the HTML template both in a checkout and in a Lake dependency cache.

The executable is often built in `.lake/build/bin`, while the template lives in
the package source tree.  Keeping the lookup here makes `importGraph` usable as
a dependency instead of requiring a particular parent repository layout.
-/
private def htmlTemplateRoot : IO FilePath := do
  let appDir := (FilePath.parent (← IO.appPath)).getD "."
  let candidates : Array FilePath := #[
    appDir / ".." / ".." / ".." / "html-template",
    appDir / ".." / ".." / ".." / "vendor" / "importGraph" / "html-template",
    appDir / ".." / ".." / ".." / ".lake" / "packages" / "importGraph" / "html-template",
    FilePath.mk "html-template",
    FilePath.mk "vendor" / "importGraph" / "html-template",
    FilePath.mk ".lake" / "packages" / "importGraph" / "html-template"
  ]
  for candidate in candidates do
    if ← (candidate / "index.html").pathExists then
      return candidate
  throw <| IO.userError <|
    "Could not find the importGraph HTML template. " ++
      "Run the command from a checkout containing html-template or set up the " ++
      "Lake package source directory."

open IO.FS IO.Process Name in
/-- Implementation of the import graph command line program. -/
def importGraphCLI (args : Cli.Parsed) : IO UInt32 := do
  -- file extensions that should be created
  let extensions : Std.HashSet String := match args.variableArgsAs! String with
    | #[] => {"dot"}
    | outputs => outputs.foldl (fun acc (o : String) =>
      match FilePath.extension o with
       | none => acc.insert "dot"
       | some "gexf" => acc.insert "gexf"
       | some "html" => acc.insert "gexf"
       -- currently all other formats are handled by passing the `.dot` file to
       -- graphviz
       | some _ => acc.insert "dot" ) {}

  let requestedTo ← match args.flag? "to" with
  | some to => pure <| to.as! (Array ModuleName)
  | none => pure #[← getCurrentModule]
  let to ←
    if (args.flag? "file-decoupling").isSome && requestedTo.size == 1 then
      projectRoots requestedTo[0]!
    else
      pure requestedTo
  let from? : Option (Array Name) := match args.flag? "from" with
  | some fr => some <| fr.as! (Array ModuleName)
  | none => none
  initSearchPath (← findSysroot)

  let progress ← GraphProgress.start
  progress.render 0 "Preparing graph export"
  let loadingDone ← IO.mkRef false
  let loadingTask ← IO.asTask (prio := .dedicated) do
    let mut tick := 0
    while !(← loadingDone.get) do
      progress.renderLoading tick "Loading Lean environment"
      IO.sleep 200
      tick := tick + 1
  unsafe Lean.enableInitializersExecution
  let outFiles ← try unsafe withImportModules (to.map ({module := ·})) {} (trustLevel := 1024) fun env => do
    loadingDone.set true
    match ← IO.wait loadingTask with
    | .ok _ => pure ()
    | .error err => throw err
    progress.render 15 "Lean environment loaded"
    let toModule := ImportGraph.getModule to[0]!
    let mut graph := env.importGraph
    progress.render 18 "Computing required modules"
    let unused ←
      match args.flag? "to" with
      | some _ =>
        let init := NameSet.ofArray to
        let ctx := { options := {}, fileName := "<input>", fileMap := default }
        let state := { env }
        let used ← Prod.fst <$> (CoreM.toIO (env.transitivelyRequiredModules' to.toList) ctx state)
        let used := used.foldl (init := init) (fun s _ t => s ∪ t)
        pure <| graph.foldl (fun acc n _ => if used.contains n then acc else acc.insert n) NameSet.empty
      | none => pure NameSet.empty
    let modulesWithSorry := if args.hasFlag "mark-sorry" then ImportGraph.allModulesWithSorry env else ∅

    if let Option.some f := from? then
      graph := graph.downstreamOf (NameSet.ofArray f)
    let includeLean := args.hasFlag "include-lean"
    let includeStd := args.hasFlag "include-std" || includeLean
    let includeDeps := args.hasFlag "include-deps" || includeStd
    -- Note: `includeDirect` does not imply `includeDeps`!
    -- e.g. if the package contains `import Lean`, the node `Lean` will be included with
    -- `--include-direct`, but not included with `--include-deps`.
    let includeDirect := args.hasFlag "include-direct"

    -- `directDeps` contains files which are not in the package
    -- but directly imported by a file in the package
    let directDeps : NameSet := graph.foldl (init := .empty) (fun acc n deps =>
      if toModule.isPrefixOf n then
        deps.filter (!toModule.isPrefixOf ·) |>.foldl (init := acc) NameSet.insert
      else
        acc)

    let filter (n : Name) : Bool :=
      toModule.isPrefixOf n ||
      bif isPrefixOf `Std n then includeStd else
      bif isPrefixOf `Lean n || isPrefixOf `Init n then includeLean else
      includeDeps
    let filterDirect (n : Name) : Bool :=
      includeDirect ∧ directDeps.contains n

    graph := graph.filterMap (fun n i =>
      if filter n then
        -- include node regularly
        (i.filter (fun m => filterDirect m || filter m))
      else if filterDirect n then
        -- include node as direct dependency; drop any further deps.
        some #[]
      else
        -- not included
        none)
    progress.render 22 "Filtered import graph"
    if args.hasFlag "exclude-meta" then
      -- Mathlib-specific exclusion of tactics
      let filterMathlibMeta : Name → Bool := fun n => (
        isPrefixOf `Mathlib.Tactic n ∨
        isPrefixOf `Mathlib.Lean n ∨
        isPrefixOf `Mathlib.Mathport n ∨
        isPrefixOf `Mathlib.Util n)
      graph := graph.filterGraph filterMathlibMeta (replacement := `«Mathlib.Tactics»)
    -- Preserve actual import statements for the HTML import audit before
    -- simplifying the graph used for the layout.
    let directImports : Array (Name × Name) :=
      graph.foldl (init := #[]) fun acc importer imported =>
      imported.foldl (init := acc) fun edges dependency =>
        edges.push (dependency, importer)
    if !args.hasFlag "show-transitive" then
      let reduced := graph.transitiveReduction
      let edgeCount ← IO.mkRef 0
      progress.render 23 "Reducing transitive import edges"
      edgeCount.set <| reduced.foldl (init := 0) fun count _ dependencies =>
        count + dependencies.size
      graph := reduced
      progress.render 25 s!"Reduced import graph ({← edgeCount.get} edges)"
    else
      progress.render 25 "Keeping transitive import edges"

    let markedPackage : Option Name := if args.hasFlag "mark-package" then toModule else none

    -- Create all output files that are requested
    let mut outFiles : Std.HashMap String String := {}
    if extensions.contains "dot" then
      let dotFile := asDotGraph graph (unused := unused) (markedPackage := markedPackage)
        (directDeps := directDeps)
        (withSorry := modulesWithSorry)
        (to := NameSet.ofArray to) (from_ := NameSet.ofArray (from?.getD #[]))
      outFiles := outFiles.insert "dot" dotFile
    let wantsHtml := (args.variableArgsAs! String).any fun output =>
      FilePath.extension output == some "html"
    if extensions.contains "gexf" || wantsHtml || (args.flag? "file-decoupling").isSome then
      -- filter out the top node as it makes the graph less pretty
      let graph₂ := match args.flag? "to" with
        | none => graph.filter (fun n _ => ! if to.contains `Mathlib then #[`Mathlib, `Mathlib.Tactic].contains n else to.contains n)
        | some _ => graph
      if extensions.contains "gexf" || wantsHtml then
        progress.render 26 "Counting declarations for file graph"
        let gexfFile ← graphToGexf graph₂ toModule env progress
        outFiles := outFiles.insert "gexf" gexfFile
        progress.render 32 "Generated file graph"
      if wantsHtml || (args.flag? "file-decoupling").isSome then
        progress.render 33 "Scanning project source files"
        let files ← sourceModules toModule
        progress.render 35 "Indexing declarations"
        let (declarationJson, candidates) ←
          declarationGraphData env graph₂ directImports files progress
        let declarationSize ← IO.mkRef 0
        progress.render 94 "Serializing declaration graph"
        let declarationText := declarationJson.compress
        declarationSize.set declarationText.length
        outFiles := outFiles.insert "decls" declarationText
        outFiles := outFiles.insert "file-decoupling" (fileDecouplingMarkdown candidates)
        progress.render 95
          s!"Serialized declaration graph ({← declarationSize.get} characters)"
    progress.render 95 "Prepared graph data"
    return outFiles

  catch err =>
    loadingDone.set true
    match ← IO.wait loadingTask with
    | .ok _ => pure ()
    | .error loadingErr => throw loadingErr
    progress.finish
    -- TODO: try to build `to` first, so this doesn't happen
    throw <| IO.userError <| s!"{err}\nIf the error above says `object file ... does not exist`, " ++
      s!"try if `lake build {" ".intercalate (to.toList.map Name.toString)}` fixes the issue"
    throw err

  progress.render 96 "Writing output files"
  match args.variableArgsAs! String with
  | #[] => writeFile "import_graph.dot" (outFiles["dot"]!)
  | outputs => for o in outputs do
     let fp : FilePath := o
     match fp.extension with
     | none
     | "dot" => writeFile fp (outFiles["dot"]!)
     | "gexf" => IO.FS.writeFile fp (outFiles["gexf"]!)
     | "html" =>
        let gexfFile := (outFiles["gexf"]!)
        -- use `html-template/index.html` and insert any dependencies to make it
        -- a stand-alone HTML file.
        -- note: changes in `index.html` might need to be reflected here!
        let templateRoot ← htmlTemplateRoot
        let mut html ← IO.FS.readFile <| ← IO.FS.realPath (templateRoot / "index.html")
        for dep in (#[
            "vendor" / "graphology.min.js",
            "vendor" / "graphology-library.min.js",
            "enhanced-viewer.js" ] : Array FilePath) do
          let depContent ← IO.FS.readFile <| ← IO.FS.realPath (templateRoot / dep)
          html := html.replace s!"<script src=\"{dep}\"></script>" s!"<script>{depContent}</script>"
        -- Inline the import and declaration graphs so the HTML works offline.
        let toFormatted : String := ", ".intercalate <| (to.map toString).toList
        html := html
          |>.replace "__IMPORTS_GEXF__" ((Json.str gexfFile).compress.replace "<" "\\u003c")
          |>.replace "__DECLARATIONS_JSON__" ((outFiles["decls"]!).replace "<" "\\u003c")
          |>.replace "__PROJECT_TITLE__" toFormatted
        IO.FS.writeFile fp html
     | some ext => try
        _ ← IO.Process.output { cmd := "dot", args := #["-T" ++ ext, "-o", o] } outFiles["dot"]!
      catch ex =>
        progress.finish
        IO.eprintln s!"Error occurred while writing out {fp}."
        IO.eprintln s!"Make sure you have `graphviz` installed and the file is writable."
        throw ex
  if let some output := args.flag? "file-decoupling" then
    IO.FS.writeFile (output.as! String) (outFiles["file-decoupling"]!)
  progress.render 100 "Graph export complete"
  progress.finish
  return 0

/-- Setting up command line options and help text for `lake exe graph`. -/
def graph : Cmd := `[Cli|
  graph VIA importGraphCLI; ["0.0.3"]
  "Generate representations of a Lean import graph. \
   By default generates the import graph up to `Mathlib`. \
   If you are working in a downstream project, use `lake exe graph --to MyProject`."

  FLAGS:
    "show-transitive";         "Show transitively redundant edges."
    "to" : Array ModuleName;   "Only show the upstream imports of the specified modules."
    "from" : Array ModuleName; "Only show the downstream dependencies of the specified modules."
    "exclude-meta";            "Exclude any files starting with `Mathlib.[Tactic|Lean|Util|Mathport]`."
    "include-direct";          "Include directly imported files from other libraries"
    "include-deps";            "Include used files from other libraries (not including Lean itself and `std`)"
    "include-std";             "Include used files from the Lean standard library (implies `--include-deps`)"
    "include-lean";            "Include used files from Lean itself (implies `--include-deps` and `--include-std`)"
    "mark-package";            "Visually highlight the package containing the first `--to` target (used in combination with some `--include-XXX`)."
    "mark-sorry";              "Visually highlight modules containing sorries."
    "file-decoupling" : String;
      "Write a Markdown table of direct project imports without declaration uses."

  ARGS:
    ...outputs : String;  "Filename(s) for the output. \
      If none are specified, generates `import_graph.dot`. \
      Automatically chooses the format based on the file extension. \
      Currently supported formats are `.dot`, `.gexf`, `.html`, \
      and if you have `graphviz` installed then any supported output format is allowed."
]


/-- `lake exe graph` -/
public def main (args : List String) : IO UInt32 :=
  graph.validate args
