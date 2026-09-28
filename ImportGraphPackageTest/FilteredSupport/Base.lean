/-! Source declarations whose users cross a filtered module namespace. -/

namespace ImportGraphPackageTest.FilteredSupport

theorem seedProof : True := True.intro
theorem seedStatement : True := True.intro
theorem seedImplicit : True := True.intro
theorem unusedSeed : True := True.intro

def Marker (_ : True) : Prop := True

class Witness : Prop where
  evidence : True

instance : Witness := ⟨seedImplicit⟩

end ImportGraphPackageTest.FilteredSupport
