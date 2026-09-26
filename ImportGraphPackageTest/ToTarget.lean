import ImportGraphPackageTest.Used
import ImportGraphPackageTest.WithSorry.Def
import ImportGraphPackageTest.WithSorry.Thm

private theorem private_add_zero (n : Nat) : n + 0 = n := by
  simp

private theorem private_rewrite (n : Nat) : n + 0 = n := by
  exact private_add_zero n

theorem public_uses_private (n : Nat) : n + 0 = n := by
  exact private_rewrite n

#guard_msgs in
theorem fancy : something = 2 := rfl
