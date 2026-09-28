import LeanGraphFixture.Prelude
import LeanGraphFixture.Algebra.Monoid

namespace LeanGraphFixture.Collections

open LeanGraphFixture.Algebra

/-! A collection module that uses both the foundation and algebra branches. -/

structure Bag where
  items : List Nat
deriving Repr

def Bag.empty : Bag := ⟨[]⟩

def Bag.push (value : Nat) (bag : Bag) : Bag := ⟨value :: bag.items⟩

def Bag.weight (bag : Bag) : Nat := bag.items.length

theorem Bag.weight_push (value : Nat) (bag : Bag) :
    (bag.push value).weight = bag.weight + 1 := by
  simp [Bag.push, Bag.weight]

def Bag.total (bag : Bag) : Nat := bag.items.foldr combine 0

theorem Bag.total_empty : Bag.empty.total = 0 := by
  rfl

theorem Bag.total_push (value : Nat) (bag : Bag) :
    (bag.push value).total = combine value bag.total := by
  simp [Bag.push, Bag.total]

end LeanGraphFixture.Collections
