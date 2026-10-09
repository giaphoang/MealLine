// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, KeyRound } from "@/components/ui/icons";
import { MagicLinkTab } from "./magic-link-tab";
import { OTPTab } from "./otp-tab";
import { AuthAttribution } from "./auth-attribution";
import { useBrand } from '@/contexts/BrandContext';
import { DeveloperLogin } from './developer-login';

export function LoginPage() {
  const brand = useBrand();
  const [activeTab, setActiveTab] = useState<"magic" | "otp">("magic");

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">{brand.staff.signInTitle}</CardTitle>
        <CardDescription>
          {brand.staff.emailGuidance}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <DeveloperLogin />
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "magic" | "otp")}
          className="w-full"
        >
          {/*
            Trigger order and panel order below must stay in step: TabsContents
            slides to the *panel's* index, not the trigger's, so a mismatch
            animates away from the tab you just clicked.
          */}
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="magic">
              <Mail className="h-4 w-4" />
              Magic Link
            </TabsTrigger>
            <TabsTrigger value="otp">
              <KeyRound className="h-4 w-4" />
              Verification Code
            </TabsTrigger>
          </TabsList>

          <TabsContents className="mt-4 px-1 pb-1">
            <TabsContent value="magic">
              <MagicLinkTab />
            </TabsContent>

            <TabsContent value="otp">
              <OTPTab />
            </TabsContent>
          </TabsContents>
        </Tabs>

        <AuthAttribution className="mt-6" showSourceLink={false} />
      </CardContent>
    </Card>
  );
}
