import { useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';

export function useNourishQuery<T>(key: string, load: () => Promise<T>, enabled = true) {
  const query = useQuery({ queryKey: ['nourish', key], queryFn: load, enabled });
  useEffect(() => { if (query.error) ErrorHandlerService.handleError(query.error, 'nourish'); }, [query.error]);
  return query;
}
export function useNourishMutation<T, R>(action: (input: T) => Promise<R>, success: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['nourish'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      messageService.success(success);
    },
    onError: (error) => ErrorHandlerService.handleError(error, 'nourish'),
  });
}
export function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
export const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
export function Status({ value }: { value: string }) { return <Badge variant="secondary">{value.replace(/_/g, ' ')}</Badge>; }
export function QueryFailure({ error, retry }: { error: unknown; retry: () => void }) {
  if (!error) return null;
  return <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"><p>{ErrorHandlerService.toUserMessage(error)}</p><Button variant="outline" size="sm" className="mt-2" onClick={retry}>Retry</Button></div>;
}
