"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/ui/form";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Button } from "@repo/ui/components/ui/button";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";
import { useEffect } from "react";
import { Id } from "@repo/backend/dataModel";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

interface RejectionReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reasonToEdit?: {
    _id: Id<"prescriptionRejectionReasons">;
    title: string;
    description?: string;
  } | null;
}

export function RejectionReasonDialog({
  open,
  onOpenChange,
  reasonToEdit,
}: RejectionReasonDialogProps) {
  const createReason = useMutation(
    api.data.prescription_rejection_reasons.createRejectionReason,
  );
  const updateReason = useMutation(
    api.data.prescription_rejection_reasons.updateRejectionReason,
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  useEffect(() => {
    if (reasonToEdit) {
      form.reset({
        title: reasonToEdit.title,
        description: reasonToEdit.description || "",
      });
    } else {
      form.reset({
        title: "",
        description: "",
      });
    }
  }, [reasonToEdit, form, open]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      if (reasonToEdit) {
        await updateReason({
          id: reasonToEdit._id,
          title: values.title,
          description: values.description,
        });
        toast.success("Rejection reason updated successfully");
      } else {
        await createReason({
          title: values.title,
          description: values.description,
          is_system_default: true, // Always system default from admin panel
        });
        toast.success("Rejection reason created successfully");
      }
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error(error);
      toast.error(getConvexErrorMessage(error, "Something went wrong"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {reasonToEdit ? "Edit Rejection Reason" : "Add Rejection Reason"}
          </DialogTitle>
          <DialogDescription>
            {reasonToEdit
              ? "Make changes to the rejection reason here."
              : "Add a new rejection reason for prescriptions. This will be a system default."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Illegible Prescription"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. The uploaded document is blurry or cannot be read."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional description for more context.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">
                {reasonToEdit ? "Save changes" : "Create reason"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
