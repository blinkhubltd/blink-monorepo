"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductForm } from "@/components/products/ProductForm";

export default function CategoryDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const categoryId = id as unknown as Id<"categories">;
  const [selectedIds, setSelectedIds] = useState<Id<"products">[]>([]);

  const category = useQuery(api.data.categories.getCategoryById, { id: categoryId });
  const products =
    useQuery(api.data.products.getProductsByCategory, { categoryId }) ?? [];
  const vendors =
    useQuery(api.data.vendors.getActiveVendors, { cursor: null, limit: 100 }) ?? [];
  const updateProduct = useMutation(api.data.products.updateProduct);
  const createProduct = useMutation(api.data.products.createProduct);

  if (!category) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{category.name}</h1>
        <p className="text-sm text-gray-600">Products in this category</p>
      </div>

      {vendors && "data" in vendors && (
        <ProductForm
          categories={[{ _id: category._id, name: category.name }]}
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
        onUpdateProduct={async (p) => {
          // Map the product data with required fields for the updateProduct mutation
          const productData = {
            id: p.id,
            name: p.name,
            slug: p.slug,
            sku: p.sku,
            category_id: p.category_id,
            price: p.price,
            quantity: p.quantity,
            status: p.status,
            // Convert image string to storage ID if provided
            image: p.image as Id<"_storage"> | undefined,
            description: p.description,
            upc: p.upc,
            vendor_id: p.vendor_id as Id<"vendors">,
            vendor_location: p.vendor_location,
            tags: p.tags,
            external_id: p.external_id,
          };
          await updateProduct(productData);
        }}
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
    </div>
  );
}
