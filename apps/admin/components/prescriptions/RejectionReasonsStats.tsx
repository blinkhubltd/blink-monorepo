"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileRemoveIcon as FileX,
  ShieldCheckIcon as ShieldCheck,
  UserCogIcon as UserCog,
} from "@hugeicons/core-free-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { api } from "@repo/backend";
import { useQuery } from "convex/react";

export function RejectionReasonsStats() {
  const reasons = useQuery(
    api.data.prescription_rejection_reasons.getAllRejectionReasons,
  );

  if (!reasons) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalReasons = reasons.length;
  const systemDefaults = reasons.filter((r: any) => r.is_system_default).length;
  const customReasons = reasons.filter((r: any) => !r.is_system_default).length;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Reasons</CardTitle>
          <HugeiconsIcon icon={FileX} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalReasons}</div>
          <p className="text-xs text-muted-foreground">
            Active and inactive reasons
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">System Defaults</CardTitle>
          <HugeiconsIcon icon={ShieldCheck} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{systemDefaults}</div>
          <p className="text-xs text-muted-foreground">
            Standard reasons available to all
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Custom Reasons</CardTitle>
          <HugeiconsIcon icon={UserCog} className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{customReasons}</div>
          <p className="text-xs text-muted-foreground">
            Created by staff members
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
