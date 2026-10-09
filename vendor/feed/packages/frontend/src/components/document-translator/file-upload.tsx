// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { useState, useRef, useEffect } from 'react';
import { Upload } from "@/components/ui/icons";
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useFilenameForm } from '@/hooks/document-translator/useFilenameForm';
import { useMessage } from '@/hooks/message/useMessage';

interface FileUploadProps {
  onUpload: (file: File, name: string) => Promise<void>;
  /**
   * Whether to automatically reset the form after successful upload
   * @default true
   */
  autoReset?: boolean;
}

export function FileUpload({ onUpload, autoReset = true }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isFileTooLarge, setIsFileTooLarge] = useState(false);
  const [hasUploadError, setHasUploadError] = useState(false);
  const [filenameSanitized, setFilenameSanitized] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    filename,
    showValidation,
    validationError,
    handleFilenameChange,
    setFilename,
    resetForm,
    validateForm,
    sanitizeFilename
  } = useFilenameForm();
  
  const { showMessage } = useMessage();
  
  // Watch for validation errors
  useEffect(() => {
    if (validationError && showValidation) {
      showMessage(validationError, 'error');
    }
  }, [validationError, showValidation, showMessage]);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };
  
  const handleFile = (selectedFile: File) => {
    // Check if file is a DOCX
    if (!selectedFile.name.toLowerCase().endsWith('.docx')) {
      alert('Please select a DOCX file');
      return;
    }
    
    // Check file size (5MB limit)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
    if (selectedFile.size > MAX_FILE_SIZE) {
      setIsFileTooLarge(true);
      return;
    }
    
    setIsFileTooLarge(false);
    setFile(selectedFile);
    
    // Auto-sanitize filename and populate if empty
    if (!filename) {
      const { sanitized, wasChanged } = sanitizeFilename(selectedFile.name);
      setFilename(sanitized);
      setFilenameSanitized(wasChanged);
      
      if (wasChanged) {
        showMessage('Filename was automatically cleaned for compatibility', 'info');
      }
    }
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };
  
  const openFileSelector = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };
  
  const handleUpload = async () => {
    if (!file) return;
    
    // Validate filename before upload
    if (!validateForm()) {
      return;
    }
    
    setIsUploading(true);
    setHasUploadError(false);
    
    try {
      await onUpload(file, filename.trim());
      
      // Only reset if autoReset is true
      if (autoReset) {
        setFile(null);
        resetForm();
        setFilenameSanitized(false);
      }
    } catch (error: any) {
      console.error('Error uploading file:', error);
      // Set error state to show visual feedback (red border)
      // Error message is already shown via toast from ErrorHandlerService
      setHasUploadError(true);
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div 
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileSelector}
      >
        <input 
          type="file"
          ref={inputRef}
          className="hidden"
          accept=".docx"
          onChange={handleFileChange}
        />
        
        <Upload className={`mx-auto h-12 w-12 ${dragActive ? 'text-primary' : 'text-gray-400'}`} />
        <p className="mt-2">
          {dragActive 
            ? 'Drop DOCX file here...'
            : 'Drag and drop a DOCX file here, or click to browse'}
        </p>
        
        {file && (
          <div className="mt-4 p-3 bg-green-50 rounded-md border border-green-200">
            <div className="flex items-start gap-2 text-green-700">
              <span aria-hidden="true" className="mt-0.5">✓</span>
              <div className="text-left space-y-1">
                <p className="font-medium">Selected file:</p>
                <p className="break-all">{file.name}</p>
                <p className="text-sm text-green-600">({Math.round(file.size / 1024)} KB)</p>
              </div>
            </div>
          </div>
        )}
        
        {isFileTooLarge && (
          <div className="mt-4 p-3 bg-red-50 rounded-md border border-red-200">
            <p className="font-medium text-red-700 flex items-center">
              <span className="mr-2">⚠️</span>
              File size exceeds the limit of 5MB. Please select a smaller file.
            </p>
          </div>
        )}
        

      </div>
      
      {file && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document-name">File Name</Label>
            <Input
              id="document-name"
              value={filename}
              onChange={(e) => {
                handleFilenameChange(e);
                // Clear upload error when user modifies filename
                if (hasUploadError) {
                  setHasUploadError(false);
                }
              }}
              placeholder="Enter a name for this DOCX file"
              maxLength={64}
              className={(showValidation && validationError) || hasUploadError ? 'border-destructive' : ''}
              disabled={isUploading}
            />
            <p className="text-sm text-muted-foreground">
              Maximum 64 characters. Special characters will be automatically cleaned.
            </p>
          </div>
          
          <Button 
              onClick={handleUpload}
              disabled={isUploading || !filename.trim()}
              className="w-full"
            >
              {isUploading ? 'Uploading...' : 'Upload File'}
            </Button>
        </div>
      )}
    </div>
  );
}
