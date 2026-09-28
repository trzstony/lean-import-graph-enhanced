import LeanGraphFixture.Algorithms.Normalize
import LeanGraphFixture.Algebra.Monoid

namespace LeanGraphFixture.Algorithms

open LeanGraphFixture.Algebra LeanGraphFixture.Prelude

/-! Scoring depends on normalization but also reaches back to algebra. -/

def score (value : Nat) : Nat := combine (normalize value) seed

theorem score_large {value : Nat} (h : atLeastSeed value) :
    score value = combine value seed := by
  simp [score, normalize_large h]

theorem score_zero : score 0 = 14 := by
  simp [score, normalize, atLeastSeed, seed, bump, combine]

private theorem hidden_score_step (value : Nat) : score (bump value) = combine (bump value) seed := by
  apply score_large
  exact atLeastSeed_bump value

end LeanGraphFixture.Algorithms
