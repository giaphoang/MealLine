import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { nourishService } from '@/services/nourish';
import { QueryFailure, useNourishQuery } from './shared';

export function NourishSummaryCards() {
  const query = useNourishQuery('summary', nourishService.summary);
  const data = query.data;
  const cards = [
    { title: 'Available fulfilment units', value: data?.stockUnits, note: `${data?.inventory ?? 0} stocked food items`, href: '/food-items' },
    { title: 'Voice intakes', value: data?.intakes, note: `${data?.pendingIntakes ?? 0} pending`, href: '/intakes' },
    { title: 'Household baskets', value: data?.drafts, note: 'drafts awaiting review', href: '/household-baskets' },
    { title: 'Delivery tasks', value: data?.deliveries, note: `${data?.pendingDeliveries ?? 0} active`, href: '/deliveries' },
  ];
  return <div className="space-y-3">
    <QueryFailure error={query.error} retry={() => void query.refetch()} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <Link key={card.href} to={card.href} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="h-full hover:bg-accent/30"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{card.title}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{query.isLoading ? '…' : card.value ?? '—'}</p><p className="mt-1 text-sm text-muted-foreground">{card.note}</p></CardContent></Card></Link>)}</div>
  </div>;
}
