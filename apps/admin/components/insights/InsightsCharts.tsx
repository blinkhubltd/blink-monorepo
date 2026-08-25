"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChartUpIcon as TrendingUp,
  DollarSignIcon as DollarSign,
} from "@hugeicons/core-free-icons";
import React from "react";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { formatKES } from "@/lib/utils";

// Color theme
const colors = {
  primary: "#000000",
  secondary: "#FFD700", // Yellow
  accent: "#FFEB3B",
  background: "#FFFFFF",
  text: "#000000",
  muted: "#666666",
};

const chartTheme = {
  background: colors.background,
  text: {
    fontSize: 12,
    fill: colors.text,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  axis: {
    domain: {
      line: {
        stroke: colors.primary,
        strokeWidth: 1,
      },
    },
    legend: {
      text: {
        fontSize: 12,
        fill: colors.text,
        fontWeight: 600,
      },
    },
    ticks: {
      line: {
        stroke: colors.primary,
        strokeWidth: 1,
      },
      text: {
        fontSize: 11,
        fill: colors.text,
      },
    },
  },
  grid: {
    line: {
      stroke: "#E5E5E5",
      strokeWidth: 1,
    },
  },
  legends: {
    title: {
      text: {
        fontSize: 11,
        fill: colors.text,
      },
    },
    text: {
      fontSize: 11,
      fill: colors.text,
    },
    ticks: {
      line: {},
      text: {
        fontSize: 10,
        fill: colors.text,
      },
    },
  },
};

// Sales Trend Chart component
export function SalesTrendChart({
  data,
}: {
  data: { salesTrend: Array<{ date: string; amount: number }> };
}) {
  const chartData = [
    {
      id: "sales",
      data: data.salesTrend.map((item) => ({
        x: new Date(item.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        y: item.amount,
      })),
    },
  ];

  return (
    <Card className="shadow-lg border">
      <CardContent className="h-80 p-6">
        <ResponsiveLine
          data={chartData}
          theme={chartTheme}
          margin={{ top: 20, right: 30, bottom: 60, left: 80 }}
          xScale={{ type: "point" }}
          yScale={{
            type: "linear",
            min: "auto",
            max: "auto",
            stacked: false,
            reverse: false,
          }}
          yFormat=" >-.2f"
          curve="cardinal"
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: -45,
            legend: "Date",
            legendOffset: 50,
            legendPosition: "middle",
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Sales (KES)",
            legendOffset: -60,
            legendPosition: "middle",
            format: (value: number) => `${(value / 1000).toFixed(0)}K`,
          }}
          pointSize={8}
          pointColor={colors.secondary}
          pointBorderWidth={2}
          pointBorderColor={colors.primary}
          pointLabelYOffset={-12}
          enableArea={true}
          areaOpacity={0.1}
          areaBaselineValue={0}
          colors={[colors.primary]}
          lineWidth={3}
          enableSlices="x"
          animate={true}
          motionConfig="gentle"
        />
      </CardContent>
    </Card>
  );
}

export function RevenueByCategoryChart({
  data,
}: {
  data: Array<{ category: string; revenue: number }>;
}) {
  const chartData = data.map((item) => ({
    category: item.category || "Uncategorized",
    revenue: item.revenue || 0,
    revenueFormatted: `KES ${(item.revenue || 0).toLocaleString()}`,
  }));

  return (
    <Card className="shadow-lg border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <span className="inline-block w-1.5 h-6 bg-yellow-500 rounded"></span>
          Revenue by Category
        </CardTitle>
      </CardHeader>
      <CardContent className="h-80 p-6">
        <ResponsiveBar
          data={chartData}
          theme={chartTheme}
          keys={["revenue"]}
          indexBy="category"
          margin={{ top: 20, right: 50, bottom: 60, left: 120 }}
          padding={0.3}
          layout="horizontal"
          valueScale={{ type: "linear" }}
          indexScale={{ type: "band", round: true }}
          colors={[colors.secondary]}
          borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
          borderWidth={1}
          borderRadius={4}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Revenue (KES)",
            legendPosition: "middle",
            legendOffset: 40,
            tickValues: 5, // Show 5 ticks
            format: (value: number) => {
              if (value >= 1000000) {
                return `KES ${(value / 1000000).toFixed(1)}M`;
              } else if (value >= 1000) {
                return `KES ${(value / 1000).toFixed(0)}K`;
              }
              return `KES ${value}`;
            },
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Category",
            legendPosition: "middle",
            legendOffset: -100,
          }}
          labelSkipWidth={12}
          labelSkipHeight={12}
          labelTextColor={colors.background}
          tooltip={({ id, value }) => (
            <div className="bg-white p-2 border border-gray-200 rounded shadow-lg">
              <strong>{id}</strong>: {`KES ${value?.toLocaleString()}`}
            </div>
          )}
          animate={true}
          motionConfig="gentle"
          role="application"
          ariaLabel="Revenue by category bar chart"
        />
      </CardContent>
    </Card>
  );
}

export function OrderStatusChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([key, value]) => ({
    id: key,
    label: key,
    value: value,
  }));

  const colorScale = [
    colors.secondary,
    colors.primary,
    colors.accent,
    "#FFA726",
    "#FF7043",
    "#AB47BC",
    "#26A69A",
  ];

  return (
    <Card className="shadow-lg border">
      {/* <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <span className="inline-block w-1.5 h-6 bg-yellow-500 rounded"></span>
          Order Status
        </CardTitle>
      </CardHeader> */}
      <CardContent className="h-80 p-6">
        <ResponsivePie
          data={chartData}
          theme={chartTheme}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          innerRadius={0.4}
          padAngle={2}
          cornerRadius={3}
          activeOuterRadiusOffset={8}
          colors={colorScale}
          borderWidth={2}
          borderColor={colors.background}
          arcLinkLabelsSkipAngle={10}
          arcLinkLabelsTextColor={colors.text}
          arcLinkLabelsThickness={2}
          arcLinkLabelsColor={{ from: "color" }}
          arcLabelsSkipAngle={10}
          arcLabelsTextColor={colors.background}
          animate={true}
          motionConfig="gentle"
          legends={[
            {
              anchor: "bottom",
              direction: "row",
              justify: false,
              translateX: 0,
              translateY: 56,
              itemsSpacing: 0,
              itemWidth: 80,
              itemHeight: 18,
              itemTextColor: colors.text,
              itemDirection: "left-to-right",
              itemOpacity: 1,
              symbolSize: 12,
              symbolShape: "circle",
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

export function RiderPerformanceChart({
  data,
}: {
  data: Array<{ name: string; completionRate: number }>;
}) {
  return (
    <Card className="shadow-lg border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <span className="inline-block w-1.5 h-6 bg-yellow-500 rounded"></span>
          Rider Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="h-80 p-6">
        <ResponsiveBar
          data={data}
          theme={chartTheme}
          keys={["completionRate"]}
          indexBy="name"
          margin={{ top: 20, right: 50, bottom: 60, left: 120 }}
          padding={0.3}
          layout="vertical"
          valueScale={{ type: "linear", min: 0, max: 100 }}
          indexScale={{ type: "band", round: true }}
          colors={[colors.primary]}
          borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
          borderWidth={1}
          borderRadius={4}
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Completion Rate (%)",
            legendPosition: "middle",
            legendOffset: 40,
            format: (value: number) => `${value}%`,
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: "Rider",
            legendPosition: "middle",
            legendOffset: -100,
          }}
          labelSkipWidth={12}
          labelSkipHeight={12}
          labelTextColor={colors.background}
          labelFormat={(value: number | string) => `${value}%`}
          animate={true}
          motionConfig="gentle"
        />
      </CardContent>
    </Card>
  );
}

export function TotalRevenueCard({
  data,
}: {
  data: {
    totalRevenue: number;
    orderCount: number;
    averageCommissionPerOrder: number;
  };
}) {
  return (
    <Card className="shadow-md">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total Blink Revenue</p>
            <p className="text-2xl font-bold">{formatKES(data.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Commission earned
            </p>
            <p className="text-xs text-muted-foreground">
              {data.orderCount.toLocaleString()} orders •{" "}
              {formatKES(data.averageCommissionPerOrder)} avg
            </p>
          </div>
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
            <HugeiconsIcon icon={DollarSign} className="w-6 h-6 text-green-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
