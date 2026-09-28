import ImportGraphPackageTestBridge.Bridge
import ImportGraphPackageTest.FilteredSupport.ImportOnly

/-! Retained consumers with proof, statement, and implicit dependency paths. -/

namespace ImportGraphPackageTest.FilteredSupport

theorem viaProof : True := ImportGraphPackageTestBridge.proofBridge

theorem viaStatement : ImportGraphPackageTestBridge.StatementBridge := True.intro

theorem viaInstance : True := ImportGraphPackageTestBridge.instanceBridge

end ImportGraphPackageTest.FilteredSupport
