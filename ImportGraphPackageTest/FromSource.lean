import ImportGraph.Imports.FromSource

/-!
# Tests for Source-Based Import Analysis

Tests for `findImportsFromSource` and `findTransitiveImportsFromSource`.
-/

open Lean System

-- Test basic import parsing
/-- info: #[`ImportGraphPackageTest.Unused] -/
#guard_msgs in
#eval do
  let imports ← findImportsFromSource "ImportGraphPackageTest/Used.lean"
  -- Filter to only ImportGraph modules
  return imports.filter (fun (n : Name) => n.getRoot ∈ [`ImportGraph, `ImportGraphPackageTest])

-- Test transitive imports without filter
/-- info: #[`ImportGraphPackageTest.Unused] -/
#guard_msgs in
#eval do
  let transitive ← findTransitiveImportsFromSource "ImportGraphPackageTest/Used.lean"
  -- Filter to only ImportGraph modules
  let filtered := transitive.toArray.filter (fun (n : Name) => n.getRoot ∈ [`ImportGraph, `ImportGraphPackageTest])
  return filtered.qsort Name.lt

-- Test transitive imports with ImportGraph filter
/-- info: #[] -/
#guard_msgs in
#eval do
  let transitive ← findTransitiveImportsFromSource "ImportGraphPackageTest/Used.lean" (some `ImportGraph)
  return transitive.toArray.qsort Name.lt

-- Test on a file with transitive imports
/-- info: #[`ImportGraph.Tools.ImportDiff, `ImportGraphPackageTest.Used] -/
#guard_msgs in
#eval do
  let imports ← findImportsFromSource "ImportGraphPackageTest/FileWithTransitiveImports.lean"
  -- Filter to only ImportGraph modules
  return imports.filter (fun (n : Name) => n.getRoot ∈ [`ImportGraph, `ImportGraphPackageTest])

/--
info: #[`ImportGraphPackageTest.Unused, `ImportGraphPackageTest.Used, `ImportGraph.Imports.ImportGraph, `ImportGraph.Tools.ImportDiff]
-/
#guard_msgs in
#eval do
  let transitive ← findTransitiveImportsFromSource "ImportGraphPackageTest/FileWithTransitiveImports.lean"
  -- Filter to only ImportGraph modules
  let filtered := transitive.toArray.filter (fun (n : Name) => n.getRoot ∈ [`ImportGraph, `ImportGraphPackageTest])
  return filtered.qsort Name.lt
