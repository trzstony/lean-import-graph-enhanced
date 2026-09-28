import LeanGraphFixture.Reexports
import LeanGraphFixture.Algorithms.Normalize

namespace LeanGraphFixture

/-! The facade is the main entry point used by the fixture root. -/

def report (value : Nat) : Nat := package value |>.total

theorem report_value (value : Nat) : report value = score value := by
  simp [report, Api.package, Collections.Bag.total_push, Collections.Bag.total_empty,
    Algebra.combine]

theorem report_zero : report 0 = 14 := by
  rw [report_value]
  exact Algorithms.score_zero

private theorem hidden_facade_check : report 0 = Prelude.seed + Prelude.seed := by
  simp [report_zero, Prelude.seed]

end LeanGraphFixture
