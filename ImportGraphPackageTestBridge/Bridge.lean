import ImportGraphPackageTestBridge.Step

/-! A second intermediate module, including a private proof dependency. -/

namespace ImportGraphPackageTestBridge

private theorem privateStep : True := proofStep

theorem proofBridge : True := privateStep

def StatementBridge : Prop := Statement

theorem instanceBridge : True := fromInstance

end ImportGraphPackageTestBridge
