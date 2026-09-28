module

public import Lean.Data.NameMap.Basic
import Lean.Data.NameMap.AdditionalOperations

/-!
# Dependency paths through hidden declarations

Keep original edges on paths between retained declarations, even when a path
passes through a filtered module. Iterative reachability also handles the cycles
between inductive types and their constructors.
-/

namespace Lean.NameMap

/-- Follow adjacency lists without assuming that the graph is acyclic. -/
private def reachableNodes (graph : NameMap (Array Name)) (roots : Array Name) : NameSet := Id.run do
  let mut reached := NameSet.ofArray roots
  let mut pending := roots
  let mut index := 0
  while index < pending.size do
    let name := pending[index]!
    index := index + 1
    for next in graph.getD name #[] do
      if !reached.contains next then
        reached := reached.insert next
        pending := pending.push next
  return reached

/-- Retain original edges on paths between the given roots.

For a declaration graph whose adjacency lists contain prerequisites, a retained
node must both be a prerequisite of a root and depend on a root. Thus unrelated
external prerequisites and external users are omitted without cutting paths
between retained declarations. Roots themselves remain present when in `graph`.
No transitive edges are introduced. -/
public def retainPathsBetween (graph : NameMap (Array Name))
    (roots : Array Name) : NameMap (Array Name) := Id.run do
  let upstream := reachableNodes graph roots
  let mut reverse : NameMap (Array Name) := {}
  for (name, dependencies) in graph.toList do
    if upstream.contains name then
      for dependency in dependencies do
        reverse := reverse.insert dependency ((reverse.getD dependency #[]).push name)
  let downstream := reachableNodes reverse roots
  return graph.filterMap fun name dependencies =>
    if upstream.contains name && downstream.contains name then
      some (dependencies.filter fun dependency => downstream.contains dependency)
    else
      none

end Lean.NameMap
