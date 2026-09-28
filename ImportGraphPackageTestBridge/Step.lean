import ImportGraphPackageTest.FilteredSupport.Base

/-! Intermediate declarations outside the displayed package namespace. -/

namespace ImportGraphPackageTestBridge

open ImportGraphPackageTest.FilteredSupport

theorem proofStep : True := seedProof

def Statement : Prop := Marker seedStatement

theorem fromInstance : True := Witness.evidence

-- This user has no path back to a displayed declaration. It must not change
-- sink status in the filtered view or be serialized as an intermediate node.
theorem unusedConsumer : True := unusedSeed

end ImportGraphPackageTestBridge
