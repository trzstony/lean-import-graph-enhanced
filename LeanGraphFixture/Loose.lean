import LeanGraphFixture.Api

namespace LeanGraphFixture

open Algorithms

/-! This source file is intentionally not imported by the root module. It should
    appear dimmed in the directory tree and is useful for testing scope filters. -/

def experimental (value : Nat) : Nat := Api.summarize [value, value]

theorem experimental_eq (value : Nat) : experimental value = score value + score value := by
  simp [experimental, Api.summarize]

end LeanGraphFixture
