import LeanGraphFixture.Algebra.Monoid

namespace LeanGraphFixture.Algebra

open LeanGraphFixture.Prelude

/-! A second algebra branch creates a diamond through `Monoid`. -/

def atLeastSeed (value : Nat) : Prop := seed ≤ value

theorem atLeastSeed_bump (value : Nat) : atLeastSeed (bump value) := by
  simp [atLeastSeed, bump, seed]

theorem combine_monotone_left {left right bound : Nat} (h : bound ≤ left) :
    bound ≤ combine left right := by
  simpa [combine] using
    (Nat.le_add_right_of_le (n := bound) (m := left) (k := right) h)

private theorem hidden_order_bridge (value : Nat) : atLeastSeed (combine value seed) := by
  simpa [atLeastSeed, combine, seed] using Nat.le_add_right (7 : Nat) value

end LeanGraphFixture.Algebra
