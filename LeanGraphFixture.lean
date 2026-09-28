import LeanGraphFixture.Facade
import LeanGraphFixture.Reexports
import LeanGraphFixture.Algebra.Monoid

namespace LeanGraphFixture

/-! Root entry point. The extra direct imports are deliberate: the first is a
    re-export already reached through `Facade`, and `Monoid` is several layers
    below it. They make the file-decoupling report useful to inspect. -/

def finalValue : Nat := report 0

theorem finalValue_ok : finalValue = 14 := by
  exact report_zero

theorem finalValue_via_public_api : finalValue = score 0 := by
  exact report_value 0

end LeanGraphFixture
