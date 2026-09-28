import LeanGraphFixture.Collections.Indexed
import LeanGraphFixture.Algebra.Order

namespace LeanGraphFixture.Algorithms

open LeanGraphFixture.Algebra LeanGraphFixture.Collections LeanGraphFixture.Prelude

/-! Normalization follows a path through indexed collections and order facts. -/

def normalize (value : Nat) : Nat :=
  if seed ≤ value then value else bump value

theorem normalize_large {value : Nat} (h : atLeastSeed value) : normalize value = value := by
  change seed ≤ value at h
  simp [normalize, h]

theorem normalize_small (value : Nat) (h : ¬ atLeastSeed value) : normalize value = bump value := by
  have h' : ¬ seed ≤ value := by
    simpa [atLeastSeed] using h
  simp [normalize, h']

def normalizeEntry (entry : Indexed) : Indexed :=
  { entry with payload := normalize entry.payload }

theorem normalizeEntry_large {entry : Indexed} (h : entry.isLarge) :
    (normalizeEntry entry).payload = entry.payload := by
  exact normalize_large h

private theorem hidden_normalize_witness : normalize 0 = seed := by
  rw [normalize_small 0]
  · exact bump_zero
  · simp [atLeastSeed, seed]

end LeanGraphFixture.Algorithms
