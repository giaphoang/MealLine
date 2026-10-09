import { useQuery } from '@tanstack/react-query';
import { Card,CardContent,CardHeader,CardTitle,CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { nourishService } from '@/services/nourish';
import { QueryFailure } from '@/components/nourish/shared';
import { formatNumber } from '@/lib/formatting/number';
import type { AnalyticsDateRange } from '@/types/analytics';

export function MealLineClientAnalytics({range}:{range:AnalyticsDateRange}) {
  const query=useQuery({queryKey:['nourish','client-analytics',range.preset,range.startDate,range.endDate],queryFn:()=>nourishService.clientAnalytics({preset:range.preset,
    ...(range.preset==='custom'&&range.startDate&&range.endDate?{startDate:range.startDate,endDate:range.endDate}:{})})});
  const a=query.data?.analytics;
  return <section className="space-y-4" aria-label="MealLine client analytics"><div><h2 className="text-xl font-semibold">MealLine households</h2><Badge variant="outline">Source: MealLine</Badge><p className="mt-2 text-sm text-muted-foreground">Separate from imported Link2Feed and SIMC records; no automatic cross-source identity matching. Date range uses the pantry’s configured timezone.</p></div>
    <QueryFailure error={query.error} retry={()=>void query.refetch()}/>{query.isLoading&&<p>Loading MealLine household counts…</p>}
    {a&&<><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[
      ['Registered households',a.registeredHouseholds,'Unique household registrations in this range.'],
      ['Requesting households',a.requestedHouseholds,'Unique households making a request in this range.'],
      ['Food requests',a.requests,'Requests received, not promised or delivered.'],
      ['Served households',a.servedHouseholds,'Unique households with a completed delivery in this range.'],
      ['Completed deliveries',a.completedDeliveries,'Actual recorded delivery completions, never approvals.'],
    ].map(([label,value,description])=><Card key={String(label)}><CardHeader><CardTitle className="text-base">{label}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="text-3xl font-semibold">{formatNumber(Number(value))}</CardContent></Card>)}</div>
      <div className="grid gap-4 lg:grid-cols-3">{[
        {title:'Household size',values:a.householdSizes},{title:'Postal code',values:a.postalCodes},{title:'Preferred call language',values:a.preferredCallLanguages},
      ].map(group=><Card key={group.title}><CardHeader><CardTitle className="text-base">{group.title}</CardTitle><CardDescription>Registrations in this range. Missing information remains unknown.</CardDescription></CardHeader><CardContent><dl className="space-y-2">{group.values.map(v=><div className="flex justify-between gap-3" key={v.label}><dt>{v.label==='en'?'English':v.label==='es'?'Spanish':v.label==='vi'?'Vietnamese':v.label}</dt><dd>{formatNumber(v.count)}</dd></div>)}</dl>{!group.values.length&&<p className="text-sm text-muted-foreground">No registrations in this range.</p>}</CardContent></Card>)}</div>
      <p className="text-sm text-muted-foreground">Call language is not household language proficiency. Age, gender, income, ethnicity and other demographics are not collected or inferred. {a.startDate} – {a.endDate}.</p>
    </>}
  </section>;
}
