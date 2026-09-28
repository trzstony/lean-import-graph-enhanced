import ImportGraph
-- `lake exe graph` below loads `ToTarget` from its compiled `.olean`. Importing it
-- makes Lake build it before this file; otherwise the build order is a race.
import ImportGraphPackageTest.ToTarget

def readFile (path : System.FilePath) : IO String :=
  IO.FS.readFile path

def runGraphCommand : IO Unit := do
  let out ← IO.Process.output {
    cmd := "lake"
    args := #["exe", "graph", "--to", "ImportGraphPackageTest.ToTarget", "--mark-sorry", "ImportGraphPackageTest/produced.dot"]
  }
  if out.exitCode != 0 then
    throw <| IO.userError s!"`lake exe graph` failed with exit code {out.exitCode}:\n{out.stderr}"

def compareOutputs (expected : String) (actual : String) : IO Bool := do
  let normalize := fun text =>
    (text.splitOn "\n" |>.filter (·.trimAscii.toString.length > 0) |>.map (·.trimAscii.toString)).mergeSort (· ≤ ·)
  let expectedLines := normalize expected
  let actualLines := normalize actual
  pure (expectedLines == actualLines)

/-- info: Test passed: The graph command output matches the expected.dot file. -/
#guard_msgs in
#eval show IO Unit from do
  runGraphCommand
  let expectedOutput ← readFile "ImportGraphPackageTest/expected.dot"
  let actualOutput ← readFile "ImportGraphPackageTest/produced.dot"
  let isEqual ← compareOutputs expectedOutput actualOutput
  if isEqual then
    IO.println "Test passed: The graph command output matches the expected.dot file."
  else
    IO.println "Test failed: The graph command output does not match the expected.dot file."
    IO.println s!"Expected:\n{expectedOutput}"
    IO.println s!"Actual:\n{actualOutput}"
