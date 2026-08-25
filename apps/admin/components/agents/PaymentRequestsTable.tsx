"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle,
  CreditCardIcon as CreditCard,
  InboxIcon as Inbox,
  Loading03Icon as Loader2,
} from "@hugeicons/core-free-icons";
import React, { useState } from "react";
import { Id } from "@repo/backend/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { TablePagination, TableSkeleton } from "@/components/shared/table";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Label } from "@repo/ui/components/ui/label";

export interface PaymentRequestRow {
  _id: Id<"agent_payment_requests">;
  agent_id: Id<"agents">;
  amount: number;
  status: "pending" | "approved" | "rejected" | "paid";
  paystack_transfer_code?: string;
  paystack_reference?: string;
  rejection_reason?: string;
  requested_at: number;
  processed_at?: number;
  agent?: {
    code: string;
    mpesa_number?: string;
    paystack_recipient_code?: string;
  } | null;
  user?: {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
}

interface PaymentRequestsPagination {
  hasNext: boolean;
  hasPrevious?: boolean;
  totalPages: number;
  currentPage?: number;
  pageSize?: number;
  total: number;
  cursor?: string | null;
}

interface PaymentRequestsTableProps {
  requests: PaymentRequestRow[];
  isLoading: boolean;
  statusFilter: "all" | "pending" | "approved" | "rejected" | "paid";
  onStatusFilterChange: (
    status: "all" | "pending" | "approved" | "rejected" | "paid",
  ) => void;
  pagination: PaymentRequestsPagination;
  onPageChange: (
    page: number,
    direction: "first" | "prev" | "next" | "last",
  ) => void;
  onPageSizeChange: (pageSize: number) => void;
  onApprove: (id: Id<"agent_payment_requests">) => Promise<void>;
  onReject: (id: Id<"agent_payment_requests">, reason: string) => Promise<void>;
  onPay: (id: Id<"agent_payment_requests">) => Promise<void>;
  canApprove?: boolean;
  canPay?: boolean;
}

const STATUS_BADGE: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  paid: "outline",
};

export function PaymentRequestsTable({
  requests,
  isLoading,
  statusFilter,
  onStatusFilterChange,
  pagination,
  onPageChange,
  onPageSizeChange,
  onApprove,
  onReject,
  onPay,
  canApprove = true,
  canPay = true,
}: PaymentRequestsTableProps) {
  const [rejectingId, setRejectingId] =
    useState<Id<"agent_payment_requests"> | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleApprove = async (id: Id<"agent_payment_requests">) => {
    setActionLoading(`approve-${id}`);
    try {
      await onApprove(id);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePay = async (id: Id<"agent_payment_requests">) => {
    setActionLoading(`pay-${id}`);
    try {
      await onPay(id);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectingId || !rejectionReason.trim()) return;
    setActionLoading(`reject-${rejectingId}`);
    try {
      await onReject(rejectingId, rejectionReason.trim());
      setRejectingId(null);
      setRejectionReason("");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium whitespace-nowrap">
          Filter by status:
        </Label>
        <Select
          value={statusFilter}
          onValueChange={onStatusFilterChange as any}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={6} showFilters={false} />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>M-Pesa</TableHead>
                  <TableHead className="text-right">Amount (KES)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <HugeiconsIcon icon={Inbox} className="h-8 w-8 mb-2" />
                        <p>No payment requests found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((req) => (
                    <TableRow key={req._id}>
                      <TableCell className="font-medium">
                        <div>
                          <p>
                            {req.user?.name ||
                              req.user?.email ||
                              "Unknown Agent"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {req.agent?.code ?? "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {req.agent?.mpesa_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {req.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            variant={STATUS_BADGE[req.status] ?? "default"}
                          >
                            {req.status.charAt(0).toUpperCase() +
                              req.status.slice(1)}
                          </Badge>
                          {req.rejection_reason && (
                            <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {req.rejection_reason}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(req.requested_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {req.status === "pending" && canApprove && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-600 hover:bg-green-50"
                                disabled={
                                  actionLoading === `approve-${req._id}`
                                }
                                onClick={() => handleApprove(req._id)}
                              >
                                {actionLoading === `approve-${req._id}` ? (
                                  <HugeiconsIcon icon={Loader2} className="h-3 w-3 animate-spin" />
                                ) : (
                                  <HugeiconsIcon icon={CheckCircle} className="h-3 w-3" />
                                )}
                                <span className="ml-1">Approve</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive border-destructive hover:bg-destructive/10"
                                disabled={actionLoading === `reject-${req._id}`}
                                onClick={() => {
                                  setRejectingId(req._id);
                                  setRejectionReason("");
                                }}
                              >
                                <HugeiconsIcon icon={XCircle} className="h-3 w-3" />
                                <span className="ml-1">Reject</span>
                              </Button>
                            </>
                          )}
                          {req.status === "approved" && canPay && (
                            <Button
                              size="sm"
                              disabled={actionLoading === `pay-${req._id}`}
                              onClick={() => handlePay(req._id)}
                            >
                              {actionLoading === `pay-${req._id}` ? (
                                <HugeiconsIcon icon={Loader2} className="h-3 w-3 animate-spin" />
                              ) : (
                                <HugeiconsIcon icon={CreditCard} className="h-3 w-3" />
                              )}
                              <span className="ml-1">Pay Now</span>
                            </Button>
                          )}
                          {req.status === "paid" && (
                            <span className="text-xs text-muted-foreground">
                              {req.paystack_transfer_code ?? "Paid"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pagination.total > 0 && (
            <TablePagination
              pagination={pagination}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              isLoading={isLoading}
            />
          )}
        </>
      )}

      {/* Reject reason dialog */}
      <Dialog
        open={!!rejectingId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingId(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reject Payment Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this payment request. The agent
              will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Reason *</Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectingId(null);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim() || !!actionLoading}
              onClick={handleRejectSubmit}
            >
              {actionLoading?.startsWith("reject") && (
                <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
