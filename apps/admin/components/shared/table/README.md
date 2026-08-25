# Shared Table Components

This directory contains reusable table components that provide consistent UI patterns across the application.

## Components Overview

### 1. TableFilters
Basic table filters component for simple filtering needs.

**Use cases:**
- Simple tables with basic search and 1-2 filter dropdowns
- Tables without bulk actions
- Standard column visibility controls

**Example:**
```tsx
<TableFilters
  table={table}
  globalFilter={globalFilter}
  onGlobalFilterChange={setGlobalFilter}
  filters={[
    {
      key: "status",
      label: "Status",
      value: statusFilter,
      options: statusOptions,
      onChange: setStatusFilter,
    }
  ]}
  filteredCount={filteredData.length}
  totalCount={allData.length}
  searchPlaceholder="Search items..."
/>
```

### 2. AdvancedTableFilters
Enhanced table filters component for complex filtering scenarios.

**Use cases:**
- Tables with multiple filter types (select, multiselect, popover)
- Tables with bulk actions
- Tables requiring custom filter components
- Complex filtering with counts and advanced UI

**Example:**
```tsx
<AdvancedTableFilters
  table={table}
  globalFilter={globalFilter}
  onGlobalFilterChange={setGlobalFilter}
  filters={[
    {
      key: "status",
      label: "Status",
      type: "multiselect",
      value: selectedStatuses,
      options: statusOptions,
      onChange: setSelectedStatuses,
    }
  ]}
  customFilters={<CustomDateRangePicker />}
  bulkActions={
    selectedRows.length > 0 && (
      <BulkActionDropdown selectedIds={selectedRows} />
    )
  }
/>
```

### 3. TablePagination
Reusable pagination component with page size controls.

**Features:**
- First, previous, next, last navigation
- Page size selector
- Current page/total pages display
- Items range display

**Example:**
```tsx
<TablePagination
  pagination={{
    hasNext: true,
    hasPrevious: false,
    totalPages: 10,
    currentPage: 1,
    pageSize: 20,
    total: 200,
  }}
  onPageChange={(page, direction) => handlePageChange(page, direction)}
  onPageSizeChange={setPageSize}
/>
```

### 4. TableSkeleton
Loading skeleton for tables.

**Example:**
```tsx
if (isLoading) {
  return <TableSkeleton rows={5} columns={6} showFilters={true} />;
}
```

## Implementation Status

### ✅ Fully Converted Tables
- **UsersTable** - Uses shared TableFilters and TablePagination
- **RidersTable** - Updated to use shared TableFilters and TablePagination

### 🔄 Partially Compatible Tables
These tables have complex custom implementations but could benefit from shared components:

- **ProductsTable** - Has advanced bulk operations, could use AdvancedTableFilters
- **CategoriesTable** - Has hierarchical display and custom popover filters
- **OrdersTable** - Complex filtering and bulk actions

### 📋 Legacy Tables
These tables use older patterns and would require significant refactoring:

- **CustomersTable** - Custom pagination and complex state management
- **ShipmentsTable** - Custom implementations throughout

## Migration Guidelines

### For Simple Tables
1. Import shared components: `import { TableFilters, TablePagination, TableSkeleton } from "@/components/shared/table";`
2. Replace custom filter components with `TableFilters`
3. Replace custom pagination with `TablePagination`  
4. Replace loading states with `TableSkeleton`

### For Complex Tables
1. Evaluate if `AdvancedTableFilters` meets requirements
2. Use `customFilters` and `bulkActions` props for specialized functionality
3. Consider creating specialized components that extend the shared patterns
4. Maintain backward compatibility during migration

### Best Practices
1. **Consistent Styling** - All shared components follow the same design system
2. **Reusable Logic** - Common patterns like search, pagination, and column visibility
3. **Flexible API** - Components accept customization through props
4. **Accessibility** - Built-in ARIA labels and keyboard navigation
5. **TypeScript** - Full type safety with generic support

## Component Dependencies

### Required UI Components
- Button, Input, Select, Checkbox, Label
- DropdownMenu, Popover
- Table components
- Skeleton (for loading states)

### Required Icons
- Search, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight

## Future Enhancements

1. **TableHeader Component** - Standardized table headers with sorting
2. **TableActions Component** - Reusable row action dropdowns  
3. **TableEmptyState Component** - Consistent empty state handling
4. **Advanced Sorting** - Multi-column sorting capabilities
5. **Export Functionality** - Built-in CSV/Excel export
6. **Virtual Scrolling** - For large datasets

## Usage Examples

See the following files for implementation examples:
- `components/users/UsersTable.tsx` - Complete implementation with shared components
- `components/riders/RidersTable.tsx` - Migrated from custom to shared components
- `app/(dashboard)/users/page.tsx` - Page-level integration example
