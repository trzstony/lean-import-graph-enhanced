import ImportGraph.Graph.Support

/-! Regression checks for pruning dependency graphs with cycles and branches. -/

open Lean

private def adjacency (entries : List (Name × Array Name)) : NameMap (Array Name) :=
  entries.foldl (fun graph (name, dependencies) => graph.insert name dependencies) {}

private def graph : NameMap (Array Name) := adjacency [
  (`consumer, #[`hiddenA, `unrelatedA]),
  (`hiddenA, #[`hiddenB]),
  (`hiddenB, #[`hiddenA, `base]),
  (`base, #[]),
  (`unrelatedA, #[`unrelatedB]),
  (`unrelatedB, #[`unrelatedA]),
  (`unusedConsumer, #[`base])]

private def kept := graph.retainPathsBetween #[`consumer, `base]

-- Cycles on a retained dependency path terminate and preserve the path.
#guard kept.getD `consumer #[] == #[`hiddenA]
#guard kept.getD `hiddenA #[] == #[`hiddenB]
#guard kept.getD `hiddenB #[] == #[`hiddenA, `base]
#guard kept.contains `base
-- Unrelated external prerequisites, cycles, and users are all pruned.
#guard !kept.contains `unrelatedA
#guard !kept.contains `unrelatedB
#guard !kept.contains `unusedConsumer
#guard (graph.retainPathsBetween #[]).isEmpty
#guard (graph.retainPathsBetween #[`absent]).isEmpty

private def diamond : NameMap (Array Name) := adjacency [
  (`consumer, #[`left, `right]), (`left, #[`base]), (`right, #[`base]), (`base, #[])]

private def keptDiamond := diamond.retainPathsBetween #[`consumer, `base]

-- Preserve both witnesses to reachability without inventing a direct edge.
#guard keptDiamond.getD `consumer #[] == #[`left, `right]
#guard keptDiamond.getD `left #[] == #[`base]
#guard keptDiamond.getD `right #[] == #[`base]
