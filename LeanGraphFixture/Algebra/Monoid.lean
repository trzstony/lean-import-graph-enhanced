import LeanGraphFixture.Prelude

namespace LeanGraphFixture.Algebra

open LeanGraphFixture.Prelude

/-! The algebra branch depends on `Prelude` and is reused by collections and APIs. -/

def combine (left right : Nat) : Nat := left + right

theorem combine_seed (value : Nat) : combine value seed = bump value := by
  simp [combine, bump]

theorem combine_assoc (a b c : Nat) : combine (combine a b) c = combine a (combine b c) := by
  simp [combine, Nat.add_assoc]

private theorem combine_commutative (a b : Nat) : combine a b = combine b a := by
  simp [combine, Nat.add_comm]

def twice (value : Nat) : Nat := combine value value

theorem twice_eq (value : Nat) : twice value = value + value := by
  rfl

end LeanGraphFixture.Algebra
