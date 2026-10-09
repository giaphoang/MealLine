// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { EventEmitter } from 'events';
import { Alert } from '@prisma/client';

class AlertEventEmitter extends EventEmitter {
  private static instance: AlertEventEmitter;

  private constructor() {
    super();
  }

  public static getInstance(): AlertEventEmitter {
    if (!AlertEventEmitter.instance) {
      AlertEventEmitter.instance = new AlertEventEmitter();
    }
    return AlertEventEmitter.instance;
  }

  emitNewAlert(alert: Alert) {
    this.emit('newAlert', alert);
  }

  emitAlertUpdate(alert: Alert) {
    this.emit('alertUpdate', alert);
  }
}

export const alertEventEmitter = AlertEventEmitter.getInstance();