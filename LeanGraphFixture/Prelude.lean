import Std

namespace LeanGraphFixture.Prelude

/-! A tiny foundation shared by every branch of the fixture graph. -/

def seed : Nat := 7

def bump (value : Nat) : Nat := value + seed

theorem seed_positive : 0 < seed := by
  decide

theorem bump_zero : bump 0 = seed := by
  simp [bump]

private theorem hidden_seed_identity (value : Nat) : value + seed = value + 7 := by
  simp [seed]

theorem bump_add (left right : Nat) : bump (left + right) = left + right + seed := by
  simp [bump, Nat.add_assoc]

end LeanGraphFixture.Prelude
