import Lean
import ImportGraph.Lean.SourceTheorem

/-! Regression fixtures for authored theorem provenance, independent of Mathlib. -/

open Lean Elab Command ImportGraph

namespace ImportGraphPackageTest.SourceTheorems

theorem seed : True := True.intro
theorem unusedSeed : True := True.intro

/-- Mimic generators which select an attribute argument narrower than the command.
The selected token deliberately also matches the generated declaration's name. -/
elab "generated_fixture " id:ident " from " seed:ident : command => do
  let name := (← getCurrNamespace) ++ id.getId
  let used ← liftCoreM <| realizeGlobalConstNoOverload seed
  liftCoreM <| addDecl <| .thmDecl {
    name, levelParams := [], type := mkConst ``True, value := mkConst used }
  addDeclarationRangesFromSyntax name (← getRef) id

generated_fixture generatedUsed from seed
generated_fixture generatedUnused from unusedSeed

theorem consumer : True := generatedUsed

-- These are authored, even though their names resemble generated simp lemmas.
@[simp] theorem authored_fst : True := True.intro

/-- A Unicode doc comment before the selected name: αβγ. -/
private theorem «authored theorem» : True := True.intro

protected theorem qualified : True := True.intro

theorem polymorphic.{u} {α : Sort u} (a : α) : a = a := rfl

-- `lemma` is supplied by downstream projects as a macro, not by Lean core.
macro "lemma " id:ident " : " type:term " := " proof:term : command =>
  `(theorem $id : $type := $proof)

lemma authored_lemma : True := True.intro

/-- Construct source locations for a header ending with its selected identifier. -/
private def headerRanges (text identifier : String) : DeclarationRanges :=
  let source := FileMap.ofString text
  { range := DeclarationRange.ofStringPositions source 0 text.rawEndPos
    selectionRange := DeclarationRange.ofStringPositions source
      ⟨text.utf8ByteSize - identifier.utf8ByteSize⟩ text.rawEndPos }

run_cmd do
  let env ← getEnv
  let positive : Array (String × String × Name) := #[
    ("theorem plain", "plain", `Some.Namespace.plain),
    ("lemma plain", "plain", `Some.Namespace.plain),
    ("/-- αβγ -/\n@[simp] private theorem plain", "plain", `Some.Namespace.plain),
    ("theorem /- nested /- comment -/ -/ plain", "plain", `Some.Namespace.plain),
    ("@[custom \"theorem fake ]\" [nested]] protected theorem plain", "plain", `plain),
    ("private theorem «two words»", "«two words»", `Some.«two words»),
    ("theorem Namespace.α", "Namespace.α", `Some.Namespace.α),
    ("theorem _root_.Namespace.α", "_root_.Namespace.α", `Namespace.α)]
  for (text, identifier, name) in positive do
    unless sourceDeclaresTheorem env (FileMap.ofString text) name (headerRanges text identifier) do
      throwError "authored header rejected: {text}"
  let negative : Array (String × String × Name) := #[
    ("simps fst snd", "snd", `reviewPair_snd),
    ("@[simps fst snd", "snd", `snd),
    ("generated_fixture named", "named", `named),
    ("def named", "named", `named),
    ("theorem original", "original", `generated),
    ("theorem _root_.Other.named", "_root_.Other.named", `Here.Other.named),
    ("@[custom theorem named", "named", `named)]
  for (text, identifier, name) in negative do
    if sourceDeclaresTheorem env (FileMap.ofString text) name (headerRanges text identifier) then
      throwError "generated/non-theorem header accepted: {text}"
  -- Keep the failure case for which the old unequal-range heuristic said true.
  for name in [`ImportGraphPackageTest.SourceTheorems.generatedUsed,
      `ImportGraphPackageTest.SourceTheorems.generatedUnused] do
    let some ranges := declRangeExt.find? env name | throwError "missing fixture range"
    unless ranges.selectionRange != ranges.range do throwError "fixture range is not narrowed"
    if sourceDeclaresTheorem env (← getFileMap) name ranges then
      throwError "generated theorem accepted as authored: {name}"

end ImportGraphPackageTest.SourceTheorems
