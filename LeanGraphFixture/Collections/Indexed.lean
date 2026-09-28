import LeanGraphFixture.Collections.Bag
import LeanGraphFixture.Algebra.Order

namespace LeanGraphFixture.Collections

open LeanGraphFixture.Algebra LeanGraphFixture.Prelude

/-! This module joins the collection and order branches. -/

structure Indexed where
  position : Nat
  payload : Nat
deriving Repr

def Indexed.toBag (entry : Indexed) : Bag := Bag.push entry.payload Bag.empty

def Indexed.isLarge (entry : Indexed) : Prop := atLeastSeed entry.payload

theorem Indexed.toBag_weight (entry : Indexed) : entry.toBag.weight = 1 := by
  simp [Indexed.toBag, Bag.weight, Bag.push, Bag.empty]

theorem Indexed.large_after_bump (position value : Nat) :
    (Indexed.mk position (bump value)).isLarge := by
  exact atLeastSeed_bump value

private theorem hidden_index_bridge (entry : Indexed) :
    entry.toBag.total = combine entry.payload 0 := by
  simp [Indexed.toBag, Bag.total_push, Bag.total_empty]

end LeanGraphFixture.Collections
