-- B1: org-wide shared Export Settings for shopping-list PDF filenames
-- (ISSUES.md #34). Single shared row; additive, non-destructive.

CREATE TABLE "ExportSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "includeDate" BOOLEAN NOT NULL DEFAULT true,
    "datePosition" TEXT NOT NULL DEFAULT 'end',
    "includeTemplateName" BOOLEAN NOT NULL DEFAULT true,
    "includeLanguage" BOOLEAN NOT NULL DEFAULT true,
    "previewBaseName" TEXT NOT NULL DEFAULT 'Shopping List',
    "translatedBaseName" TEXT NOT NULL DEFAULT 'Shopping List',
    "updatedAt" DATETIME NOT NULL
);
