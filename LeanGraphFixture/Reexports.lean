import LeanGraphFixture.Api
import LeanGraphFixture.Algebra.Order

/-! A re-export layer makes the graph distinguish source imports from API use. -/

namespace LeanGraphFixture

export Api (package package_weight summarize summarize_single)
export Algorithms (normalize normalizeEntry normalize_large normalize_small score score_large score_zero)
export Algebra (atLeastSeed atLeastSeed_bump combine combine_assoc combine_monotone_left combine_seed twice twice_eq)

theorem reexported_score (value : Nat) : score value = combine (normalize value) Prelude.seed := by
  rfl

end LeanGraphFixture
