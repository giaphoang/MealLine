// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import express from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import { validateMinLength } from '../utils/foodItemUtils';
import { SUPPORT_CONTACT_SENTENCE } from '../lib/support';

const router = express.Router();

// Get all saved custom texts
router.get('/', async (req, res) => {
  try {
    const customTexts = await prisma.savedCustomText.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(customTexts);
  } catch (error) {
    console.error('Error fetching custom texts:', error);
    res.status(500).json({ error: 'We couldn\'t retrieve your saved custom texts. Please refresh the page or try again later.' });
  }
});

// Get a custom text by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const customText = await prisma.savedCustomText.findUnique({
      where: { id: Number(id) },
    });
    
    if (!customText) {
      return res.status(404).json({ error: 'The requested custom text could not be found. It may have been deleted.' });
    }
    
    res.json(customText);
  } catch (error) {
    console.error('Error fetching custom text:', error);
    res.status(500).json({ error: 'We couldn\'t retrieve this custom text. Please refresh the page or try again later.' });
  }
});

// Create a new custom text
router.post('/', async (req, res) => {
  const { text, isTitle = true } = req.body;

  // Input validation
  if (!text || !validateMinLength(text, 3)) {
    return res.status(400).json({ error: 'Please enter at least 3 characters for your custom text.' });
  }

  try {
    // Check if custom text already exists
    const existingText = await prisma.savedCustomText.findFirst({
      where: { text: text.trim() },
    });

    if (existingText) {
      return res.status(409).json({ error: 'This custom text is already saved. Please use a different text.' });
    }

    const newCustomText = await prisma.savedCustomText.create({
      data: {
        text: text.trim(),
        isTitle: Boolean(isTitle),
      },
    });

    res.status(201).json(newCustomText);
  } catch (error) {
    console.error('Error creating custom text:', error);
    res.status(500).json({ error: `We couldn't save your custom text. Please try again later. ${SUPPORT_CONTACT_SENTENCE}` });
  }
});

// Update a custom text by ID
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { text, isTitle } = req.body;

  // Input validation
  if (text && !validateMinLength(text, 3)) {
    return res.status(400).json({ error: 'Custom text must be at least 3 characters' });
  }

  try {
    // If text is provided, check for duplicates
    if (text) {
      const existingText = await prisma.savedCustomText.findFirst({
        where: {
          text: text.trim(),
          id: { not: Number(id) },
        },
      });

      if (existingText) {
        return res.status(409).json({ error: 'Another custom text with this content already exists. Please use different content.' });
      }
    }

    const data: any = {};
    if (text) data.text = text.trim();
    if (isTitle !== undefined) data.isTitle = Boolean(isTitle);

    const updatedCustomText = await prisma.savedCustomText.update({
      where: { id: Number(id) },
      data,
    });

    res.json(updatedCustomText);
  } catch (error) {
    console.error('Error updating custom text:', error);
    
    // Specific error for text not found
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'The custom text you\'re trying to update could not be found. It may have been deleted.' });
    }
    
    res.status(500).json({ error: `We couldn't save your changes to this custom text. Please try again later. ${SUPPORT_CONTACT_SENTENCE}` });
  }
});

// Delete a custom text by ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await prisma.savedCustomText.delete({
      where: { id: Number(id) },
    });
    
    res.json({ message: 'Custom text deleted successfully' });
  } catch (error) {
    console.error('Error deleting custom text:', error);
    
    // Specific error for text not found
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'The custom text you\'re trying to delete could not be found. It may have been deleted already.' });
    }
    
    res.status(500).json({ error: `We couldn't delete this custom text. Please try again later. ${SUPPORT_CONTACT_SENTENCE}` });
  }
});

export default router;
