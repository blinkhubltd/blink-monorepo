"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { ProductTable, EditProductForm } from "@/components/products/ProductTable";
import { ProductForm } from "@/components/products/ProductForm";
import { FormShell } from "@/components/module/form-shell";
import { useModuleForm } from "@/components/module/use-module-form";

export default function CategoryDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const categoryId = id as unknown as Id<"categories">;
  const [selectedIds, setSelectedIds] = useState<Id<"products">[]>([]);
  const form = useModuleForm<any>();

  const category = useQuery(api.data.categories.getCategoryById, { id: categoryId });
  const products =
    useQuery(api.data.products.getProductsByCategory, { categoryId }) ?? [];
  const vendors =
    useQuery(api.data.vendors.getActiveVendors, { cursor: null, limit: 100 }) ?? [];
  const updateProduct = useMutation(api.data.products.updateProduct);
  const createProduct = useMutation(api.data.products.createProduct);

  if (!category) return null;

  const categoryOptions = [{ _id: category._id, name: category.name }];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{category.name}</h1>
        <p className="text-sm text-gray-600">Products in this category</p>
      </div>

      {vendors && "data" in vendors && (
        <ProductForm
          categories={categoryOptions}
          vendors={vendors.data}
          onSubmit={async (values) => {
            await createProduct(values);
          }}
        />
      )}

      <ProductTable
        products={products as any}
        categoryIdToName={
          new Map([[category._id as unknown as string, category.name]])
        }
        onEditProduct={form.handleEdit}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        paginationMeta={{
          page: 1,
          limit: 10,
          total: products.length,
          totalPages: Math.ceil(products.length / 10),
          hasNext: false,
          hasPrevious: false,
        }}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />

      {vendors && "data" in vendors && (
        <FormShell
          presentation={form.presentation}
          open={form.open}
          onOpenChange={form.setOpen}
          title="Edit Product"
          description="Update the product information."
        >
          {form.selected && (
            <EditProductForm
              product={form.selected}
              categories={categoryOptions}
              vendors={vendors.data}
              onSubmit={async (values) => {
                await updateProduct(values);
                form.setOpen(false);
              }}
              onCancel={() => form.setOpen(false)}
            />
          )}
        </FormShell>
      )}
    </div>
  );
}
