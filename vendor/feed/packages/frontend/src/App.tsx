// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import * as React from 'react'
import { useEffect } from 'react'
import { MotionConfig } from 'motion/react'
import { queryClient } from './lib/react-query'
import { ShoppingLists } from './components/shopping-lists'
import { ShoppingListBuilder } from './components/shopping-lists/builder/ShoppingListBuilder'
import { DocumentTranslator } from './components/document-translator'
import { CategoryManagement } from './components/category-management'
import { FoodItemManagement } from './components/food-item-management'
import { AnalyticsWorkspace } from './components/analytics'
import { ReportsManagementWorkspace } from './components/reports-management'
import { CategoryProvider } from './contexts/CategoryContext'
import { FoodItemProvider } from './contexts/FoodItemContext'
import { Toaster } from './components/ui/toaster'
import { RootLayout } from './components/layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { BrandLogo } from './components/brand-logo'
import { TranslationManagement } from './components/translation-management'
import { LanguageManagement } from './components/language-management'
import { LanguageProvider } from './contexts/LanguageContext'
import { StatsCards } from './components/dashboard/stats-cards'
import { InventoryChart } from './components/dashboard/inventory-chart'
import { CategoryChart } from './components/dashboard/category-chart'
import { TranslationMetrics } from './components/dashboard/translation-metrics'
import { TranslationPerformance } from './components/dashboard/translation-performance'
import { DashboardOperationalCards } from './components/dashboard/operational-cards'
import { CostForecast } from './components/dashboard/cost-forecasting/cost-forecast'
import { UsageSummary } from './components/dashboard/usage-stats/usage-summary'
import { TokenUsageMetrics } from './components/dashboard/token-usage'
import { useTokenMetrics } from './hooks/dashboard/useTokenMetrics'
import { ThemeProvider } from './components/theme-provider'
import { AuthProvider } from './contexts/AuthContext'
import { BrandProvider, useBrand } from './contexts/BrandContext'
import { ProtectedRoute } from './components/protected-route'
import { AdminRoute } from './components/admin-route'
import { AdminPage as AdminWorkspace } from './components/admin'
import LoginPage from './components/pages/login-page'
import { MagicLinkConfirmPage } from './components/auth/magic-link-confirm'
import LogoutPage from './components/pages/logout-page'
import { AIConfiguration } from './components/ai-configuration'
import { HelpGuidePage } from './components/help/HelpGuidePage'
import { HelpPage } from './components/help/HelpPage'
import { SettingsWorkspace } from './components/settings'
import { DataManagementWorkspace } from './components/data-management'
import { ServiceLogWorkspace } from './components/service-log'
import { getUserGuideBySlug } from './lib/user-guides'
import DashboardErrorBoundary from './components/dashboard/dashboard-error-boundary'
import { NourishIntakes } from './components/nourish/intakes'
import { NourishBaskets } from './components/nourish/baskets'
import { NourishDeliveries } from './components/nourish/deliveries'
import { NourishSummaryCards } from './components/nourish/summary'
import { NourishClients } from './components/nourish/clients'
// Removed PrintView and in-browser print route (deprecated)

function CategoryPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Inventory"},
        { title: "Categories" }
      ]}
    >
      <CategoryProvider>
        <CategoryManagement />
      </CategoryProvider>
    </RootLayout>
  )
}

function FoodItemPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Inventory"},
        { title: "Food Items" }
      ]}
    >
      <CategoryProvider>
        <FoodItemProvider>
          <FoodItemManagement />
        </FoodItemProvider>
      </CategoryProvider>
    </RootLayout>
  )
}

function AnalyticsPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Information" },
        { title: "Analytics" },
      ]}
    >
      <AnalyticsWorkspace />
    </RootLayout>
  )
}

function ReportsManagementPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Information" },
        { title: "Reports" },
      ]}
    >
      <ReportsManagementWorkspace />
    </RootLayout>
  )
}

function DataManagementPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Information" },
        { title: "Data Management" },
      ]}
    >
      <DataManagementWorkspace />
    </RootLayout>
  )
}

function ServiceLogPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Service" },
        { title: "Service Log" },
      ]}
    >
      <ServiceLogWorkspace />
    </RootLayout>
  )
}

function HomePage() {
  return <HomePageInner />
}

function NourishPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <RootLayout breadcrumbs={[{ title: 'Dashboard (Home)', href: '/' }, { title: 'MealLine fulfilment' }, { title }]}>{children}</RootLayout>
}

function HomePageInner() {
  const brand = useBrand();
  // React Query 5 Native Refetch Pattern - Dashboard invalidation
  const queryClient = useQueryClient();
  
  // Invalidate all dashboard queries on mount to ensure fresh data
  useEffect(() => {
    queryClient.invalidateQueries({ 
      queryKey: ['dashboard'], 
      exact: false 
    });
  }, [queryClient]);
  
  // Get token metrics data
  const { data: tokenData, isLoading: isTokenLoading } = useTokenMetrics();
  
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)" }
      ]}
    >
      <div className="mt-4">
        {/* Logo and Title - Clean borderless card as in next-gen */}
        <Card className="mx-auto w-full max-w-[1400px] bg-transparent bg-none border-0 shadow-none mb-4">
          <CardHeader className="pb-1">
            <div className="flex justify-center mb-1">
              <BrandLogo className="h-20 w-auto" />
            </div>
            <CardTitle className="text-center text-xl">
              {brand.identity.appName} System
            </CardTitle>
            <CardDescription className="text-center text-muted-foreground">
              {brand.identity.tagline}
            </CardDescription>
          </CardHeader>
        </Card>
        
        {/* Dashboard Content Container */}
        <div className="mx-auto max-w-7xl w-full px-4">
        <DashboardErrorBoundary>
          <div className="mb-4"><NourishSummaryCards /></div>
          {/* Stats Cards - Full Width */}
        <div className="mb-4">
            <StatsCards />
          </div>

          <div className="mb-4">
            <DashboardOperationalCards />
          </div>

          {/* Charts with consistent spacing */}
        <div className="space-y-4">
          {/* Two-column charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <InventoryChart />
            <CategoryChart />
              </div>
            
            {/* Additional charts */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <CostForecast />
              <UsageSummary />
            </div>
            
            {/* Token Usage Metrics - Full Width */}
            <div>
              {isTokenLoading || !tokenData ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Token Usage Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px] w-full bg-muted/20 animate-pulse rounded-md"></div>
                  </CardContent>
                </Card>
              ) : (
                <TokenUsageMetrics 
                  dailyUsage={tokenData.dailyUsage}
                  monthlyUsage={tokenData.monthlyUsage}
                  modelUsage={tokenData.modelUsage}
                  rateLimit={tokenData.rateLimit}
                  requestsPerMinute={tokenData.requestsPerMinute}
                  requestsPerDay={tokenData.requestsPerDay}
                  historicalData={tokenData.historicalData}
                />
              )}
            </div>
            
            {/* Full-width charts */}
            <div>
              <TranslationPerformance />
            </div>
            
            <div>
              <TranslationMetrics />
            </div>
          </div>
          </DashboardErrorBoundary>
        </div>
      </div>
    </RootLayout>
  )
}

function LanguagePage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Language & Translation"},
        { title: "Languages" }
      ]}
    >
      <LanguageProvider>
        <LanguageManagement />
      </LanguageProvider>
    </RootLayout>
  )
}

function TranslationPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Language & Translation"},
        { title: "Translations" }
      ]}
    >
      <LanguageProvider>
        <TranslationManagement />
      </LanguageProvider>
    </RootLayout>
  )
}

function ShoppingListsPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Tools & Settings"},
        { title: "Shopping Lists" }
      ]}
    >
      <LanguageProvider>
        <ShoppingLists />
      </LanguageProvider>
    </RootLayout>
  )
}

function ShoppingListBuilderPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Tools & Settings"},
        { title: "Shopping Lists", href: "/shopping-lists" },
        { title: "Builder" }
      ]}
    >
      {/*
        LanguageProvider is required for the builder's Translation Settings
        modal (and any future translation-aware UI). Without it, hooks like
        useLanguageContext() throw at mount, crashing the React tree to a
        blank page. Other translation-aware pages wrap in this provider
        the same way -- see the routes for Translation Management,
        Language Management, and Shopping Lists above.
      */}
      <LanguageProvider>
        <CategoryProvider>
          <FoodItemProvider>
            <ShoppingListBuilder />
          </FoodItemProvider>
        </CategoryProvider>
      </LanguageProvider>
    </RootLayout>
  )
}

function DocumentTranslatorPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Tools & Settings"},
        { title: "Document Translator" }
      ]}
    >
      <DocumentTranslator />
    </RootLayout>
  )
}

function AIConfigurationPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Tools & Settings"},
        { title: "AI Configuration" }
      ]}
    >
      <AIConfiguration />
    </RootLayout>
  )
}

function HelpIndexPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Information"},
        { title: "Help" }
      ]}
    >
      <HelpPage />
    </RootLayout>
  )
}

function AdminPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Tools & Settings" },
        { title: "Admin" },
      ]}
    >
      <AdminWorkspace />
    </RootLayout>
  )
}

function SettingsPage() {
  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Tools & Settings" },
        { title: "Settings" },
      ]}
    >
      <SettingsWorkspace />
    </RootLayout>
  )
}

function HelpDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const guide = slug ? getUserGuideBySlug(slug) : null

  return (
    <RootLayout
      breadcrumbs={[
        { title: "Dashboard (Home)", href: "/" },
        { title: "Information"},
        { title: "Help", href: "/help" },
        { title: guide?.title ?? "Guide" }
      ]}
    >
      <HelpGuidePage />
    </RootLayout>
  )
}

function App() {
  return (
    // `reducedMotion="user"` makes every Motion component in the tree honour
    // the OS "reduce motion" setting: transform and layout animations are
    // dropped, opacity is kept. Motion drives things CSS cannot reach — the
    // animate-ui tab indicator's spring, the animated icons — so the
    // reduced-motion rules in index.css do not cover them on their own.
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrandProvider>
          <AuthProvider>
            <Router basename="/feed">
              <>
                <Routes>
                  {/* Public login route */}
                  <Route path="/login" element={<LoginPage />} />
                  {/* Public by necessity: the visitor is not signed in yet.
                      Consumes nothing on load — the token is spent only when
                      the recipient presses the button. */}
                  <Route path="/sign-in/confirm" element={<MagicLinkConfirmPage />} />
                  <Route path="/logout" element={<LogoutPage />} />
                
                  {/* Protected routes */}
                  <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/categories" element={<CategoryPage />} />
                    <Route path="/food-items" element={<FoodItemPage />} />
                    <Route path="/intakes" element={<NourishPage title="Voice Intakes"><NourishIntakes /></NourishPage>} />
                    <Route path="/clients" element={<NourishPage title="Clients"><NourishClients /></NourishPage>} />
                    <Route path="/household-baskets" element={<NourishPage title="Household Baskets"><NourishBaskets /></NourishPage>} />
                    <Route path="/deliveries" element={<NourishPage title="Deliveries"><NourishDeliveries /></NourishPage>} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/reports" element={<ReportsManagementPage />} />
                    <Route path="/languages" element={<LanguagePage />} />
                    <Route path="/translations" element={<TranslationPage />} />
                    <Route path="/shopping-lists" element={<ShoppingListsPage />} />
                    <Route path="/shopping-lists/builder" element={<ShoppingListBuilderPage />} />
                    {/** In-browser PrintView removed; use server-side React-PDF export instead */}
                    <Route path="/document-translator" element={<DocumentTranslatorPage />} />
                    <Route path="/ai-configuration" element={<AIConfigurationPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    {/* Administrator-only. The server enforces authority on
                        every /api/admin route independently — this guard only
                        decides what the browser renders. */}
                    <Route element={<AdminRoute />}>
                      <Route path="/admin" element={<AdminPage />} />
                    </Route>
                    <Route path="/data-management" element={<DataManagementPage />} />
                    <Route path="/service-log" element={<ServiceLogPage />} />
                    <Route path="/help" element={<HelpIndexPage />} />
                    <Route path="/help/:slug" element={<HelpDetailPage />} />
                  
                    {/* Catch-all route for any unmatched routes */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
                <Toaster />
              </>
            </Router>
          </AuthProvider>
          </BrandProvider>
        </ThemeProvider>
        {import.meta.env.VITE_RQ_DEVTOOLS === 'true' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </MotionConfig>
  )
}

export default App
