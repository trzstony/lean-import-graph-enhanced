import Lean

/-! Fixtures for source theorem classification in exported graphs. -/

namespace ImportGraphPackageTest.Declarations

@[ext] structure Sample where
  value : Nat
  valid : value = value

private structure PrivateSample where
  value : Nat

/-- A real theorem using a generated constructor lemma. -/
theorem sample_injective (a b : Nat) (h : Sample.mk a rfl = Sample.mk b rfl) : a = b :=
  Sample.mk.inj h

-- These names resemble generated declarations but are authored theorems.
namespace Authored.mk

theorem injEq : True := True.intro
theorem sizeOf_spec : True := True.intro

end Authored.mk

private theorem private_sink : True := True.intro

-- All of these are legal source names, including in a namespace component.
-- Their resemblance to generated helper names must not hide private theorems.
namespace PrivateNames

private theorem proof_1 : True := True.intro
private theorem eq_1 : True := True.intro
private theorem match_1 : True := True.intro
private theorem omega_1 : True := True.intro

private theorem proof_2 : True := True.intro

theorem uses_private : True := proof_2

namespace proof_10

private theorem ordinary : True := True.intro

end proof_10
end PrivateNames

/-- Using a generated private helper must retain it only in the support graph. -/
private theorem private_sample_injective (a b : Nat)
    (h : PrivateSample.mk a = PrivateSample.mk b) : a = b :=
  PrivateSample.mk.inj h

theorem used_theorem : True := True.intro

/-- Pattern matching creates additional compiled helper declarations. -/
def through_match : Nat → { n : Nat // n = n ∧ True }
  | 0 => ⟨0, rfl, used_theorem⟩
  | n + 1 => ⟨n, rfl, used_theorem⟩

theorem final_result : True := (through_match 2).property.2

end ImportGraphPackageTest.Declarations
