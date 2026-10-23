// Command eqa-xlsx-import documents the Python importer under scripts/eqa_xlsx_import.py.
// Prefer: DATABASE_URL=... python3 scripts/eqa_xlsx_import.py --commit
// On ECS: scripts/run-eqa-xlsx-import-on-ecs.sh [xlsx] [commit|dry-run]
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "Use scripts/eqa_xlsx_import.py (conflict-safe EQA xlsx import).")
	fmt.Fprintln(os.Stderr, "  DATABASE_URL=postgres://... python3 scripts/eqa_xlsx_import.py --dry-run")
	fmt.Fprintln(os.Stderr, "  DATABASE_URL=postgres://... python3 scripts/eqa_xlsx_import.py --commit")
	fmt.Fprintln(os.Stderr, "ECS: scripts/run-eqa-xlsx-import-on-ecs.sh [xlsx] [commit|dry-run]")
	os.Exit(2)
}
