-- CreateTable
CREATE TABLE "GlobalLimit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "value" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameSearch" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 10,
    "limitType" TEXT NOT NULL DEFAULT 'household',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "icon" TEXT DEFAULT 'package'
);

-- CreateTable
CREATE TABLE "CategoryTranslation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameSearch" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 10,
    "limitType" TEXT NOT NULL DEFAULT 'household',
    "isInStock" BOOLEAN NOT NULL DEFAULT true,
    "isLimited" BOOLEAN NOT NULL DEFAULT false,
    "isClearance" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" INTEGER NOT NULL,
    "vegan" BOOLEAN NOT NULL DEFAULT false,
    "vegetarian" BOOLEAN NOT NULL DEFAULT false,
    "glutenFree" BOOLEAN NOT NULL DEFAULT false,
    "organic" BOOLEAN NOT NULL DEFAULT false,
    "halal" BOOLEAN NOT NULL DEFAULT false,
    "kosher" BOOLEAN NOT NULL DEFAULT false,
    "readyToEat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodItemTranslation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "foodItemId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FoodItemTranslation_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Language" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "originalText" TEXT NOT NULL,
    "translatedText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "language" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalCost" REAL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "documentId" INTEGER,
    "skipTranslation" BOOLEAN NOT NULL DEFAULT false,
    "classificationAction" TEXT,
    "classificationPromptId" INTEGER,
    CONSTRAINT "Translation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Translation_classificationPromptId_fkey" FOREIGN KEY ("classificationPromptId") REFERENCES "SystemPrompt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "endpoint" TEXT NOT NULL DEFAULT 'completion',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "storagePath" TEXT,
    "fileSize" INTEGER,
    "contentType" TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastTranslatedAt" DATETIME,
    "metadata" JSONB
);

-- CreateTable
CREATE TABLE "TranslatedDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fileName" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "TranslatedDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShoppingListTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "layoutType" TEXT NOT NULL DEFAULT 'full-page',
    "paperSize" TEXT NOT NULL DEFAULT 'letter',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShoppingListSection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateId" INTEGER NOT NULL,
    "sectionType" TEXT NOT NULL,
    "categoryId" INTEGER,
    "displayOrder" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "subtitle" TEXT,
    "configuration" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShoppingListSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ShoppingListTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShoppingListSection_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShoppingListInstance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateId" INTEGER NOT NULL,
    "generatedData" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT,
    CONSTRAINT "ShoppingListInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ShoppingListTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShoppingListPDF" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "instanceId" INTEGER NOT NULL,
    "uuid" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "layoutType" TEXT NOT NULL,
    "generationTime" INTEGER,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShoppingListPDF_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ShoppingListInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIConfiguration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "serviceType" TEXT,
    "model" TEXT,
    "modelName" TEXT,
    "endpointUrl" TEXT,
    "encryptedApiKey" TEXT,
    "inputCost" REAL,
    "outputCost" REAL,
    "unitPrice" TEXT,
    "temperature" REAL DEFAULT 0.7,
    "topP" REAL DEFAULT 1.0,
    "maxTokens" INTEGER,
    "tokensPerMinute" INTEGER,
    "requestsPerMinute" INTEGER,
    "requestsPerDay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "salt" TEXT
);

-- CreateTable
CREATE TABLE "SystemPrompt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "promptType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "serviceDescription" TEXT,
    "translationApproach" TEXT,
    "contextGuidance" TEXT,
    "additionalGuidance" TEXT,
    "skipTranslation" TEXT,
    "includeEnglish" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "includeEnglishThreshold" REAL DEFAULT 0.7,
    "skipTranslationThreshold" REAL DEFAULT 0.7,
    "temperature" REAL DEFAULT 0.7,
    "topP" REAL DEFAULT 1.0,
    "rememberFormattingChoices" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "FormattingChoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "originalText" TEXT NOT NULL,
    "classificationAction" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "confidence" REAL,
    "textHash" TEXT,
    "systemPromptId" INTEGER NOT NULL,
    "documentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormattingChoice_systemPromptId_fkey" FOREIGN KEY ("systemPromptId") REFERENCES "SystemPrompt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormattingChoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedCustomText" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "isTitle" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "aiConfigurationId" INTEGER NOT NULL,
    "configurationSnapshot" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operationType" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalCost" REAL NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "duration" INTEGER,
    "translationId" INTEGER,
    "documentId" INTEGER,
    "modelUsed" TEXT NOT NULL,
    "serviceProvider" TEXT NOT NULL,
    "language" TEXT,
    CONSTRAINT "UsageRecord_aiConfigurationId_fkey" FOREIGN KEY ("aiConfigurationId") REFERENCES "AIConfiguration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsageRecord_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "UsageRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_nameSearch_key" ON "Category"("nameSearch");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTranslation_categoryId_language_key" ON "CategoryTranslation"("categoryId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "FoodItem_nameSearch_key" ON "FoodItem"("nameSearch");

-- CreateIndex
CREATE UNIQUE INDEX "FoodItemTranslation_foodItemId_language_key" ON "FoodItemTranslation"("foodItemId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "Language_name_key" ON "Language"("name");

-- CreateIndex
CREATE INDEX "Translation_classificationPromptId_idx" ON "Translation"("classificationPromptId");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_originalText_language_type_key" ON "Translation"("originalText", "language", "type");

-- CreateIndex
CREATE INDEX "ApiUsageLog_timestamp_idx" ON "ApiUsageLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Document_name_key" ON "Document"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Document_uuid_key" ON "Document"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "TranslatedDocument_uuid_key" ON "TranslatedDocument"("uuid");

-- CreateIndex
CREATE INDEX "ShoppingListTemplate_language_idx" ON "ShoppingListTemplate"("language");

-- CreateIndex
CREATE INDEX "ShoppingListSection_templateId_idx" ON "ShoppingListSection"("templateId");

-- CreateIndex
CREATE INDEX "ShoppingListSection_categoryId_idx" ON "ShoppingListSection"("categoryId");

-- CreateIndex
CREATE INDEX "ShoppingListSection_displayOrder_idx" ON "ShoppingListSection"("displayOrder");

-- CreateIndex
CREATE INDEX "ShoppingListInstance_templateId_idx" ON "ShoppingListInstance"("templateId");

-- CreateIndex
CREATE INDEX "ShoppingListInstance_generatedAt_idx" ON "ShoppingListInstance"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingListPDF_instanceId_key" ON "ShoppingListPDF"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingListPDF_uuid_key" ON "ShoppingListPDF"("uuid");

-- CreateIndex
CREATE INDEX "ShoppingListPDF_instanceId_idx" ON "ShoppingListPDF"("instanceId");

-- CreateIndex
CREATE INDEX "ShoppingListPDF_createdAt_idx" ON "ShoppingListPDF"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIConfiguration_name_key" ON "AIConfiguration"("name");

-- CreateIndex
CREATE INDEX "AIConfiguration_deletedAt_idx" ON "AIConfiguration"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemPrompt_name_key" ON "SystemPrompt"("name");

-- CreateIndex
CREATE INDEX "FormattingChoice_textHash_systemPromptId_idx" ON "FormattingChoice"("textHash", "systemPromptId");

-- CreateIndex
CREATE INDEX "FormattingChoice_systemPromptId_idx" ON "FormattingChoice"("systemPromptId");

-- CreateIndex
CREATE INDEX "FormattingChoice_source_idx" ON "FormattingChoice"("source");

-- CreateIndex
CREATE UNIQUE INDEX "FormattingChoice_originalText_systemPromptId_key" ON "FormattingChoice"("originalText", "systemPromptId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCustomText_text_key" ON "SavedCustomText"("text");

-- CreateIndex
CREATE INDEX "UsageRecord_aiConfigurationId_idx" ON "UsageRecord"("aiConfigurationId");

-- CreateIndex
CREATE INDEX "UsageRecord_timestamp_idx" ON "UsageRecord"("timestamp");

-- CreateIndex
CREATE INDEX "UsageRecord_serviceProvider_idx" ON "UsageRecord"("serviceProvider");

-- CreateIndex
CREATE INDEX "UsageRecord_operationType_idx" ON "UsageRecord"("operationType");

-- CreateIndex
CREATE INDEX "UsageRecord_success_idx" ON "UsageRecord"("success");

-- CreateIndex
CREATE INDEX "UsageRecord_language_idx" ON "UsageRecord"("language");
