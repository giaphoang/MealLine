import { BaseApiService } from '../base';
import {
  OperationalAnalyticsResult,
  OperationalReportRequest,
} from '@/types/operational-reports';

class OperationalReportsService extends BaseApiService {
  constructor() {
    super('/api/reports');
  }

  query(request: OperationalReportRequest) {
    return this.post<OperationalAnalyticsResult>('/query', request);
  }

  async downloadCardCsv(cardId: string, request: OperationalReportRequest) {
    const { blob, filename } = await this.requestBinary(
      `/cards/${encodeURIComponent(cardId)}/csv`,
      { method: 'POST', body: JSON.stringify(request) }
    );
    this.download(blob, filename ?? `${cardId}.csv`);
  }

  async downloadRawCsv(request: OperationalReportRequest) {
    const { blob, filename } = await this.requestBinary('/raw/csv', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    this.download(blob, filename ?? 'operational-history-raw.csv');
  }

  private download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export const operationalReportsService = new OperationalReportsService();
