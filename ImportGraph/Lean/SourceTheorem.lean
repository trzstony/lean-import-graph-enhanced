module

public import Lean.DeclarationRange
public import Lean.Parser.Command
public import Lean.ProjFns
import Lean.Util.Path

/-!
# Confirming theorem authorship from source

Declaration ranges identify locations, not provenance: generators such as `simps`
can give a generated theorem a narrow selection range inside an attribute. Confirm
that the selection is the name in an explicit `theorem` or `lemma` header before
classifying it as an authored theorem. Only the header is lexed; custom notation and
proof tactics do not need to be parsed or executed.
-/

open Lean

namespace ImportGraph

/-- Lex a declaration header using Lean's lexer, including escaped identifiers,
strings, and nested comments. Documentation comments are retained as syntax nodes. -/
private def headerTokens (env : Environment) (text : String) : Option (Array Syntax) := Id.run do
  let input := Parser.mkInputContext text "<declaration header>" (normalizeLineEndings := false)
  let parser : Parser.ParserFn := fun c s => Id.run do
    let mut s := Parser.whitespace c s
    while !c.atEnd s.pos && !s.hasError do
      let start := s.pos
      if c.get start == '/' && c.get (c.next start) == '-' &&
          c.get (c.next (c.next start)) == '-' then
        s := Parser.Command.plainDocComment.fn c s
      else
        s := Parser.tokenFn [] c s
      if s.pos == start then
        return s.mkError "expected a declaration header token"
    return s
  let state := parser.run input { env, options := {} } (Parser.getTokenTable env)
    (Parser.mkParserState text)
  if !state.allErrors.isEmpty then return none
  return some (state.stxStack.extract 0 state.stxStack.size)

private def isToken (stx : Syntax) (token : String) : Bool :=
  stx.isAtom && stx.getAtomVal == token

/-- Check the actual header and the exact selected identifier, rather than inferring
provenance from the shape of a source range. `source` uses Lean-normalized line endings. -/
public def sourceDeclaresTheorem (env : Environment) (source : FileMap)
    (name : Name) (ranges : DeclarationRanges) : Bool := Id.run do
  let start := source.ofPosition ranges.range.pos
  let selected := source.ofPosition ranges.selectionRange.pos
  let stop := source.ofPosition ranges.selectionRange.endPos
  if !(start ≤ selected && selected < stop && stop ≤ source.source.rawEndPos &&
      stop ≤ source.ofPosition ranges.range.endPos) then
    return false
  let text := String.Pos.Raw.extract source.source start stop
  let some tokens := headerTokens env text | return false
  let mut i := 0
  if tokens[i]?.any (·.isOfKind ``Parser.Command.docComment) then i := i + 1
  -- Attributes may contain arbitrary identifiers, strings and balanced brackets.
  -- A selection inside the attribute cannot be a theorem declaration's name.
  if tokens[i]?.any (isToken · "@[") then
    i := i + 1
    let mut depth := 1
    while i < tokens.size && depth > 0 do
      let token := tokens[i]!
      if isToken token "[" || isToken token "@[" then depth := depth + 1
      if isToken token "]" then depth := depth - 1
      i := i + 1
    if depth != 0 then return false
  while tokens[i]?.any (fun token =>
      ["private", "public", "protected", "meta", "noncomputable", "unsafe", "partial", "nonrec"].any
        (isToken token)) do
    i := i + 1
  let some keyword := tokens[i]? | return false
  -- `lemma` may be introduced by a downstream command macro, so its token can
  -- be an identifier in the exporter's environment.
  if !(isToken keyword "theorem" || isToken keyword "lemma" ||
      (keyword.isIdent && keyword.getId == `lemma)) then return false
  let some identifier := tokens[i + 1]? | return false
  if i + 2 != tokens.size || !identifier.isIdent then return false
  if identifier.getPos? != some ⟨selected.byteIdx - start.byteIdx⟩ ||
      identifier.getTailPos? != some ⟨stop.byteIdx - start.byteIdx⟩ then return false
  let writtenName := identifier.getId.eraseMacroScopes
  let userName := (privateToUserName name).eraseMacroScopes
  if (`_root_).isPrefixOf writtenName then
    return writtenName.replacePrefix `_root_ .anonymous == userName
  return writtenName.isSuffixOf userName

/-- Confirm authored theorem names in the requested modules. Source files are read
once per module. Missing source is reported and never guessed to imply authorship;
those declarations can still participate in the hidden dependency graph. -/
public def sourceTheoremNames (env : Environment) (modules : NameSet) : IO NameSet := do
  let mut candidates : NameMap (Array (Name × DeclarationRanges)) := {}
  for (name, ci) in env.constants.map₁.toList do
    unless ci matches .thmInfo _ do continue
    if env.isProjectionFn name then continue
    let some idx := env.getModuleIdxFor? name | continue
    let moduleName := env.header.moduleNames[idx.toNat]!
    if !modules.contains moduleName then continue
    let some ranges := declRangeExt.find? (level := .exported) env name <|>
        declRangeExt.find? (level := .server) env name | continue
    candidates := candidates.insert moduleName
      ((candidates.getD moduleName #[]).push (name, ranges))
  let searchPath := [System.FilePath.mk "."] ++ (← getSrcSearchPath) ++
    [(← findSysroot) / "src" / "lean"]
  let mut result : NameSet := {}
  let mut missing : Array Name := #[]
  for (moduleName, entries) in candidates.toList do
    let source? ← try
      let path ← findLean searchPath moduleName
      pure (some (FileMap.ofString (← IO.FS.readFile path).crlfToLf))
    catch _ => pure none
    match source? with
    | none => missing := missing.push moduleName
    | some source =>
      for (name, ranges) in entries do
        if sourceDeclaresTheorem env source name ranges then result := result.insert name
  if !missing.isEmpty then
    IO.eprintln <| s!"Warning: cannot verify theorem authorship in {missing.size} module(s): " ++
      ", ".intercalate ((missing.toList.take 5).map Name.toString) ++
      ". Source files are unavailable; their theorems remain available for dependency tracing. " ++
      "Run through `lake env`/`lake exe` with the matching sources available."
  return result

end ImportGraph
