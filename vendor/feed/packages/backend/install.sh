#!/bin/bash

# Install backend dependencies and docx4js
cd /Users/russbook/wth_app_clean/packages/backend
npm install
npm install docx4js@latest

# Apply database migration for any schema changes
npx prisma migrate dev --name add_document_translation

echo "Installation completed successfully!"
