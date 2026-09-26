import ImportGraph.Tools.ImportDiff
import ImportGraphPackageTest.Unused
import ImportGraphPackageTest.FileWithTransitiveImports

/--
info: The following are already imported (possibly transitively):
ImportGraphPackageTest.FileWithTransitiveImports
---
info: Found 2 additional imports:
ImportGraphPackageTest.FileWithTransitiveImports
ImportGraphPackageTest.Used
-/
#guard_msgs in
#import_diff ImportGraphPackageTest.FileWithTransitiveImports

/--
info: The following are already imported (possibly transitively):
ImportGraphPackageTest.FileWithTransitiveImports
ImportGraphPackageTest.Used
---
info: Found 2 additional imports:
ImportGraphPackageTest.FileWithTransitiveImports
ImportGraphPackageTest.Used
-/
#guard_msgs in
#import_diff ImportGraphPackageTest.FileWithTransitiveImports ImportGraphPackageTest.Used


/-- error: File SomeBogusFilename cannot be found. -/
#guard_msgs in
#import_diff SomeBogusFilename
