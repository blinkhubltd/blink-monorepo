"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import IncentivesTable from "./IncentivesTable";
import BaseEarningsTable from "./BaseEarningsTable";
import BaseEarningsForm from "./BaseEarningsForm";
import IncentivesForm from "./IncentivesForm";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { formatKES } from "@/lib/utils";

export default function EarningsManagement() {
  const [activeTab, setActiveTab] = useState("base-earnings");
  const [showBaseForm, setShowBaseForm] = useState(false);
  const [showIncentivesForm, setShowIncentivesForm] = useState(false);

  // Fetch current base earnings
  const riderBaseEarnings = useQuery(api.data.incentives.getCurrentBaseEarnings, {
    role: "RIDER",
  });
  const pickerBaseEarnings = useQuery(api.data.incentives.getCurrentBaseEarnings, {
    role: "PICKER",
  });

  // Fetch current incentive configs
  const riderIncentives = useQuery(
    api.data.incentives.getCurrentIncentiveConfigNew,
    { role: "RIDER" }
  );
  const pickerIncentives = useQuery(
    api.data.incentives.getCurrentIncentiveConfigNew,
    { role: "PICKER" }
  );

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="base-earnings">Base Earnings</TabsTrigger>
          <TabsTrigger value="incentives">Incentives & Bonuses</TabsTrigger>
        </TabsList>

        <TabsContent value="base-earnings" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Base Earnings</h2>
            <Button
              variant={showBaseForm ? "outline" : "default"}
              onClick={() => setShowBaseForm((s) => !s)}
            >
              {showBaseForm
                ? "Hide Form"
                : riderBaseEarnings || pickerBaseEarnings
                  ? "Edit Base Earnings"
                  : "Add Base Earnings"}
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Base Earnings Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Current Base Earnings</CardTitle>
                <CardDescription>
                  Monthly fixed earnings for riders and pickers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Riders</h4>
                  {riderBaseEarnings ? (
                    <div className="text-sm">
                      <p>
                        <span className="font-medium">Amount:</span>
                        {formatKES(riderBaseEarnings.monthly_base_amount)}
                      </p>
                      <p>
                        <span className="font-medium">Effective:</span>{" "}
                        {new Date(
                          riderBaseEarnings.effective_from
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No base earnings configured
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Pickers</h4>
                  {pickerBaseEarnings ? (
                    <div className="text-sm">
                      <p>
                        <span className="font-medium">Amount:</span>{" "}
                        {formatKES(pickerBaseEarnings.monthly_base_amount)}
                      </p>
                      <p>
                        <span className="font-medium">Effective:</span>{" "}
                        {new Date(
                          pickerBaseEarnings.effective_from
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No base earnings configured
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Dialog open={showBaseForm} onOpenChange={setShowBaseForm}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>
                  {riderBaseEarnings || pickerBaseEarnings
                    ? "Update Base Earnings"
                    : "Create Base Earnings"}
                </DialogTitle>
                <DialogDescription>
                  {riderBaseEarnings || pickerBaseEarnings
                    ? "Modify the existing monthly base earnings configuration."
                    : "Define a new monthly base earnings configuration for riders or pickers."}
                </DialogDescription>
              </DialogHeader>
              <div className="pt-2">
                <BaseEarningsForm
                  existingRiderEarnings={riderBaseEarnings}
                  existingPickerEarnings={pickerBaseEarnings}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowBaseForm(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Base Earnings History Table */}
          <Card>
            <CardHeader>
              <CardTitle>Base Earnings History</CardTitle>
              <CardDescription>
                View all base earnings configurations over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BaseEarningsTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incentives" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Incentives & Bonuses</h2>
            <Button
              variant={showIncentivesForm ? "outline" : "default"}
              onClick={() => setShowIncentivesForm((s) => !s)}
            >
              {showIncentivesForm
                ? "Hide Form"
                : riderIncentives || pickerIncentives
                  ? "Edit Incentives"
                  : "Add Incentives"}
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Current Incentives Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Current Incentive Structure</CardTitle>
                <CardDescription>
                  Daily bonus paid per task above the daily threshold
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Riders</h4>
                  {riderIncentives ? (
                    <div className="text-sm space-y-1">
                      <p>
                        <span className="font-medium">Daily Threshold:</span>{" "}
                        {riderIncentives.threshold_daily} deliveries
                      </p>
                      <p>
                        <span className="font-medium">Daily Bonus:</span>
                        {formatKES(riderIncentives.bonus_per_extra_daily)} per
                        extra delivery
                      </p>
                      {/* Weekly & monthly incentives removed */}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No incentive structure configured
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Pickers</h4>
                  {pickerIncentives ? (
                    <div className="text-sm space-y-1">
                      <p>
                        <span className="font-medium">Daily Threshold:</span>{" "}
                        {pickerIncentives.threshold_daily} picks
                      </p>
                      <p>
                        <span className="font-medium">Daily Bonus:</span>{" "}
                        {formatKES(pickerIncentives.bonus_per_extra_daily)} per
                        extra pick
                      </p>
                      {/* Weekly & monthly incentives removed */}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No incentive structure configured
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Example calculation removed (daily-only model) */}
          </div>

          <Dialog
            open={showIncentivesForm}
            onOpenChange={setShowIncentivesForm}
          >
            <DialogContent className="sm:max-w-[650px]">
              <DialogHeader>
                <DialogTitle>
                  {riderIncentives || pickerIncentives
                    ? "Update Incentives"
                    : "Create Incentives"}
                </DialogTitle>
                <DialogDescription>
                  {riderIncentives || pickerIncentives
                    ? "Modify the existing incentives threshold & bonus configuration."
                    : "Define thresholds and bonus amounts for riders or pickers."}
                </DialogDescription>
              </DialogHeader>
              <div className="pt-2">
                <IncentivesForm
                  existingRiderConfig={riderIncentives}
                  existingPickerConfig={pickerIncentives}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowIncentivesForm(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Incentives History Table */}
          <Card>
            <CardHeader>
              <CardTitle>Incentive Configuration History</CardTitle>
              <CardDescription>
                View all incentive configurations over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IncentivesTable />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
