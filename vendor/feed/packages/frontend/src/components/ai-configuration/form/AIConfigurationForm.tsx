// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { useState, useEffect } from "react"
import { AIConfigurationType } from "../types"
import { useMessage } from "@/hooks/message/useMessage"

interface AIConfigurationFormProps {
  onSubmit: (data: {
    name: string;
    type: AIConfigurationType;
    value: string;
    description?: string;
    // API Key specific fields
    modelName?: string;
    model?: string;
    serviceType?: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure';
    endpointUrl?: string;
    apiKey?: string;
    inputCost?: number;
    outputCost?: number;
    temperature?: number;
    topP?: number;
  }) => Promise<void>;
  error?: { message: string } | null;
  isSaving?: boolean;
  initialName?: string;
  initialType?: AIConfigurationType;
  initialValue?: string;
  initialDescription?: string;
  onCancel?: () => void;
}

export function AIConfigurationForm({ 
  onSubmit, 
  error, 
  isSaving = false,
  initialName = '',
  initialType = 'prompt',
  initialValue = '',
  initialDescription = '',
  onCancel
}: AIConfigurationFormProps) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<AIConfigurationType>(initialType);
  const [value, setValue] = useState(initialValue);
  const [description, setDescription] = useState(initialDescription);
  const [showValidation, setShowValidation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // API Key specific fields
  const [modelName, setModelName] = useState('');
  const [model, setModel] = useState('');
  const [serviceType, setServiceType] = useState<'OpenAI' | 'Anthropic' | 'Google' | 'Azure'>('Google');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [inputCost, setInputCost] = useState<number | undefined>(undefined);
  const [outputCost, setOutputCost] = useState<number | undefined>(undefined);
  const [temperature, setTemperature] = useState<number | undefined>(0.8);
  const [topP, setTopP] = useState<number | undefined>(1.0);
  
  const { showMessage } = useMessage();

  useEffect(() => {
    if (error) {
      showMessage(error.message, 'error');
    }

    if (validationError && showValidation) {
      showMessage(validationError, 'error');
    }
  }, [error, validationError, showValidation, showMessage]);

  const validateForm = () => {
    setShowValidation(true);
    
    if (!name.trim()) {
      setValidationError('Configuration name is required');
      return false;
    }
    
    if (name.trim().length < 3 || name.trim().length > 100) {
      setValidationError('Configuration name must be between 3 and 100 characters');
      return false;
    }
    
    if (type === 'apikey') {
      if (!modelName.trim()) {
        setValidationError('Model name is required');
        return false;
      }
      if (!model.trim()) {
        setValidationError('Model is required');
        return false;
      }
      if (!endpointUrl.trim()) {
        setValidationError('Endpoint URL is required');
        return false;
      }
      if (!apiKey.trim()) {
        setValidationError('API key is required');
        return false;
      }
      // Soft validation: show warning via centralized message, but do not block submit
      if (serviceType === 'OpenAI' && !apiKey.trim().startsWith('sk-')) {
        showMessage('This doesn’t look like a typical OpenAI API key. Please double-check the value. You can continue and verify later.', 'warning');
      }
      if (inputCost !== undefined && inputCost < 0) {
        setValidationError('Input cost must be non-negative');
        return false;
      }
      if (outputCost !== undefined && outputCost < 0) {
        setValidationError('Output cost must be non-negative');
        return false;
      }
      if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
        setValidationError('Temperature must be between 0 and 2');
        return false;
      }
      if (topP !== undefined && (topP < 0 || topP > 1)) {
        setValidationError('Top-p must be between 0 and 1');
        return false;
      }
    } else {
      if (!value.trim()) {
        setValidationError('Configuration value is required');
        return false;
      }

      if (type === 'prompt' && value.trim().length > 4000) {
        setValidationError('System prompt must be less than 4000 characters');
        return false;
      }
    }

    setValidationError(null);
    return true;
  };

  const resetForm = () => {
    setName(initialName);
    setType(initialType);
    setValue(initialValue);
    setDescription(initialDescription);
    setShowValidation(false);
    setValidationError(null);
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const submitData = {
        name: name.trim(),
        type,
        value: type === 'apikey' ? '' : value.trim(),
        description: description.trim() || undefined,
        // API Key specific fields
        ...(type === 'apikey' && {
          modelName: modelName.trim(),
          model: model.trim(),
          serviceType,
          endpointUrl: endpointUrl.trim(),
          apiKey: apiKey.trim(),
          inputCost,
          outputCost,
          temperature,
          topP
        })
      };
      
      await onSubmit(submitData);
      resetForm();
    } catch (err) {
      console.error('AIConfigurationForm - Error:', err);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (showValidation) {
      setShowValidation(false);
      setValidationError(null);
    }
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValue(e.target.value);
    if (showValidation) {
      setShowValidation(false);
      setValidationError(null);
    }
  };

  const getValueInputComponent = () => {
    switch (type) {
      case 'prompt':
        return (
          <Textarea
            id="value"
            value={value}
            onChange={handleValueChange}
            disabled={isSaving}
            placeholder="Enter system prompt..."
            rows={6}
            maxLength={4000}
            className={showValidation && validationError ? 'border-destructive' : ''}
          />
        );
      case 'apikey':
        return (
          <Input
            id="value"
            type="password"
            value={value}
            onChange={handleValueChange}
            disabled={isSaving}
            placeholder="sk-proj-..."
            className={showValidation && validationError ? 'border-destructive' : ''}
          />
        );
      default:
        return (
          <Input
            id="value"
            value={value}
            onChange={handleValueChange}
            disabled={isSaving}
            placeholder="Enter configuration value..."
            className={showValidation && validationError ? 'border-destructive' : ''}
          />
        );
    }
  };

  const getValueLabel = () => {
    switch (type) {
      case 'prompt':
        return 'System Prompt';
      case 'apikey':
        return 'API Key';
      default:
        return 'Value';
    }
  };

  const getValueDescription = () => {
    switch (type) {
      case 'prompt':
        return 'System instructions for AI operations (max 4000 characters)';
      case 'apikey':
        return 'OpenAI API key (stored securely)';
      default:
        return 'Configuration value';
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContents>
        <TabsContent value="basic" className="space-y-4">
          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="name">Configuration Name</Label>
            <Input
              id="name"
              value={name}
              onChange={handleNameChange}
              disabled={isSaving}
              placeholder="Enter configuration name..."
              maxLength={100}
              className={showValidation && validationError ? 'border-destructive' : ''}
            />
          </div>

          {/* Type Select */}
          <div className="space-y-2">
            <Label htmlFor="type">Configuration Type</Label>
            <Select
              value={type}
              onValueChange={(value: AIConfigurationType) => setType(value)}
              disabled={isSaving}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prompt">System Prompt</SelectItem>
                <SelectItem value="apikey">API Key</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* API Key specific fields */}
          {type === 'apikey' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="modelName">Model Name</Label>
                <Input
                  id="modelName"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  disabled={isSaving}
                  placeholder="GPT-4o mini"
                  className={showValidation && validationError ? 'border-destructive' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={isSaving}
                  placeholder="gpt-4o-mini-2024-07-18"
                  className={showValidation && validationError ? 'border-destructive' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceType">Service Type</Label>
                <Select
                  value={serviceType}
                  onValueChange={(value: 'OpenAI' | 'Anthropic' | 'Google' | 'Azure') => setServiceType(value)}
                  disabled={isSaving}
                >
                  <SelectTrigger id="serviceType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OpenAI">OpenAI</SelectItem>
                    <SelectItem value="Anthropic">Anthropic</SelectItem>
                    <SelectItem value="Google">Google (Default)</SelectItem>
                    <SelectItem value="Azure">Azure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={isSaving}
                  placeholder="sk-EXAMPLE-NOT-A-REAL-KEY-PASTE-YOUR-API-KEY-HERE"
                  className={showValidation && validationError ? 'border-destructive' : ''}
                />
              </div>
            </>
          ) : (
            /* Value Input for non-API key types */
            <div className="space-y-2">
              <Label htmlFor="value">{getValueLabel()}</Label>
              {getValueInputComponent()}
              <p className="text-sm text-muted-foreground">
                {getValueDescription()}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          {type === 'apikey' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="endpointUrl">Endpoint URL</Label>
                <Input
                  id="endpointUrl"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  disabled={isSaving}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  className={showValidation && validationError ? 'border-destructive' : ''}
                />
                <p className="text-sm text-muted-foreground">
                  Custom endpoint URL (uses OpenAI default if empty)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inputCost">Input Cost (per million tokens)</Label>
                <Input
                  id="inputCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputCost ?? ''}
                  onChange={(e) => setInputCost(e.target.value ? parseFloat(e.target.value) : undefined)}
                  disabled={isSaving}
                  placeholder="1.10"
                  className={showValidation && validationError ? 'border-destructive' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="outputCost">Output Cost (per million tokens)</Label>
                <Input
                  id="outputCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={outputCost ?? ''}
                  onChange={(e) => setOutputCost(e.target.value ? parseFloat(e.target.value) : undefined)}
                  disabled={isSaving}
                  placeholder="0.60"
                  className={showValidation && validationError ? 'border-destructive' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={temperature ?? ''}
                  onChange={(e) => setTemperature(e.target.value ? parseFloat(e.target.value) : undefined)}
                  disabled={isSaving}
                  placeholder="0.8"
                  className={showValidation && validationError ? 'border-destructive' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="topP">Top-p</Label>
                <Input
                  id="topP"
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={topP ?? ''}
                  onChange={(e) => setTopP(e.target.value ? parseFloat(e.target.value) : undefined)}
                  disabled={isSaving}
                  placeholder="1.0 (Default)"
                  className={showValidation && validationError ? 'border-destructive' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSaving}
                  placeholder="Enter optional description..."
                  rows={3}
                  maxLength={500}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSaving}
                placeholder="Enter optional description..."
                rows={3}
                maxLength={500}
              />
            </div>
          )}
        </TabsContent>
        </TabsContents>
      </Tabs>

      <div className="flex justify-end gap-4">
        <Button 
          variant="ghost" 
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : initialName ? 'Update Configuration' : 'Add Configuration'}
        </Button>
      </div>
    </div>
  )
}
