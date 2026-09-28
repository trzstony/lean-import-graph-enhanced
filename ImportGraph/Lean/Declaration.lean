module

public import ImportGraph.Lean.SourceTheorem
public import Lean.ProjFns
import Lean.Meta.Match.MatcherInfo

/-!
# Source declarations in the interactive graph

Compiled environments include generated theorems as well as declarations written
in source. Keep generated proof helpers in the support graph, so dependency paths
through them remain available without presenting them as authored theorem sinks.
-/

open Lean

namespace ImportGraph

/-- A theorem confirmed by its explicit source header. Generated source locations
alone do not establish authorship; build the index with `sourceTheoremNames`. -/
public def isSourceTheorem (env : Environment) (name : Name)
    (authored : NameSet) : Bool :=
  match env.find? name with
  | some (.thmInfo _) => !env.isProjectionFn name && authored.contains name
  | _ => false

/-- Visible graph declarations exclude generated theorem and recursor helpers.
Proof-valued structure fields remain visible, but have kind `field`.

Remove Lean's private-name prefix before checking for internal names. Legal
source identifiers such as `proof_1` and `eq_1` are not evidence of generated
code; the theorem case verifies the declaration header in its original source. -/
public def isVisibleGraphDeclaration (env : Environment) (name : Name)
    (authored : NameSet) : Bool :=
  !isReservedName env name &&
    !(privateToUserName name).isInternal &&
    !Lean.isAuxRecursor env name && !Lean.isNoConfusion env name &&
    !Lean.isRecCore env name && !Lean.Meta.isMatcherCore env name &&
    match env.find? name with
    | some (.thmInfo _) => env.isProjectionFn name || isSourceTheorem env name authored
    | some _ => true
    | none => false

/-- Classify source fields separately even when Lean represents them as theorems. -/
public def graphDeclarationKind (env : Environment) (ci : ConstantInfo) : String :=
  if env.isProjectionFn ci.name then "field" else
  match ci with
  | .thmInfo _ => "theorem"
  | .defnInfo _ => "definition"
  | .axiomInfo _ => "axiom"
  | .opaqueInfo _ => "opaque"
  | .inductInfo _ => "inductive"
  | .ctorInfo _ => "constructor"
  | .recInfo _ => "recursor"
  | .quotInfo _ => "quotient"

end ImportGraph
