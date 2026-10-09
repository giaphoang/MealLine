const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
const allowedValueImportFiles = new Set([
  path.join(sourceRoot, "lib/food-icons.ts"),
]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".removed")) {
      files.push(fullPath);
    }
  }

  return files;
}

const violations = [];

for (const file of walk(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.moduleSpecifier.text !== "lucide-react"
    ) {
      continue;
    }

    const clause = statement.importClause;
    const namedBindings = clause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    const valueImports = namedBindings.elements
      .filter((specifier) => {
        const imported = (specifier.propertyName || specifier.name).text;
        return !clause.isTypeOnly && !specifier.isTypeOnly && imported !== "LucideIcon";
      })
      .map((specifier) => (specifier.propertyName || specifier.name).text);

    if (valueImports.length > 0 && !allowedValueImportFiles.has(file)) {
      violations.push({
        file: path.relative(path.resolve(__dirname, ".."), file),
        imports: valueImports,
      });
    }
  }
}

if (violations.length > 0) {
  console.error("Found lucide-react value imports outside the FEED animated icon registry:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.imports.join(", ")}`);
  }
  console.error("Import animated icons from @/components/ui/icons instead.");
  process.exit(1);
}

console.log("Lucide icon coverage check passed.");
