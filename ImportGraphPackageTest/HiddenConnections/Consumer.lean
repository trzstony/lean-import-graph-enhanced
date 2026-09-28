import Lean
import ImportGraphPackageTest.HiddenConnections.Base

/-!
A compiled theorem whose only project prerequisite is behind two generated
proof helpers. The helpers intentionally have no source declaration ranges.
-/

open Lean Elab Tactic

elab "hidden_connection_fixture" : tactic => do
  let first := `ImportGraphPackageTest.HiddenConnections.consumer._proof_1
  let second := `ImportGraphPackageTest.HiddenConnections.consumer._proof_2
  addDecl <| .thmDecl {
    name := first
    levelParams := []
    type := mkConst ``True
    value := mkConst ``ImportGraphPackageTest.HiddenConnections.seed }
  addDecl <| .thmDecl {
    name := second
    levelParams := []
    type := mkConst ``True
    value := mkConst first }
  closeMainGoal `hidden_connection_fixture (mkConst second)

namespace ImportGraphPackageTest.HiddenConnections

theorem consumer : True := by hidden_connection_fixture

end ImportGraphPackageTest.HiddenConnections
