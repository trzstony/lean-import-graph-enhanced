import LeanGraphFixture.Algorithms.Score
import LeanGraphFixture.Collections.Bag

namespace LeanGraphFixture.Api

open LeanGraphFixture.Algorithms LeanGraphFixture.Collections

/-! Public declarations intentionally hide the deeper module paths. -/

def summarize (values : List Nat) : Nat :=
  values.foldl (fun total value => total + score value) 0

theorem summarize_single (value : Nat) : summarize [value] = score value := by
  simp [summarize]

def package (value : Nat) : Bag := Bag.push (score value) Bag.empty

theorem package_weight (value : Nat) : (package value).weight = 1 := by
  simp [package, Bag.weight, Bag.push, Bag.empty]

private theorem hidden_api_bridge (value : Nat) : (package value).total = score value := by
  simp [package, Bag.total_push, Bag.total_empty, LeanGraphFixture.Algebra.combine]

end LeanGraphFixture.Api
