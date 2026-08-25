"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon as AlertTriangle,
  CancelCircleIcon as XCircle,
  CheckmarkCircle02Icon as CheckCircle2,
  Delete02Icon as Trash2,
  Download01Icon as Download,
  FileSpreadsheetIcon as FileSpreadsheet,
  Loading03Icon as Loader2,
  Upload01Icon as Upload,
} from "@hugeicons/core-free-icons";
import { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Badge } from "@repo/ui/components/ui/badge";

export interface ColumnMapping {
  /** Excel column header name */
  excelHeader: string;
  /** Internal field name */
  field: string;
  /** Whether this field is required */
  required: boolean;
  /** Transform function to apply to the raw cell value */
  transform?: (value: any) => any;
  /** Validation function; return error string or undefined */
  validate?: (value: any) => string | undefined;
}

export interface ImportConfig {
  /** Display name for the entity type (e.g. "Products") */
  entityName: string;
  /** Column definitions with mapping + validation */
  columns: ColumnMapping[];
  /** Max rows allowed per import */
  maxRows?: number;
}

export interface ParsedRow {
  rowNumber: number;
  data: Record<string, any>;
  errors: string[];
  isValid: boolean;
}

interface ExcelImportProps {
  config: ImportConfig;
  onImport: (rows: Record<string, any>[]) => Promise<{
    success: number;
    failed: number;
    errors: string[];
  }>;
  onClose: () => void;
  /** Optional template download callback */
  onDownloadTemplate?: () => void;
}

export function ExcelImport({
  config,
  onImport,
  onClose,
  onDownloadTemplate,
}: ExcelImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const maxRows = config.maxRows ?? 500;

  const parseFile = useCallback(
    (f: File) => {
      setFile(f);
      setParseError(null);
      setImportResult(null);
      setParsedRows([]);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          // A workbook can carry no sheets; indexing Sheets with undefined
          // yields undefined and sheet_to_json throws on it.
          const sheetName = workbook.SheetNames[0];
          const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
          if (!sheet) {
            throw new Error("That file has no worksheets.");
          }
          const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(
            sheet,
            { defval: "" },
          );

          if (jsonData.length === 0) {
            setParseError("The spreadsheet is empty. Please add data rows.");
            return;
          }

          if (jsonData.length > maxRows) {
            setParseError(
              `Too many rows (${jsonData.length}). Maximum allowed is ${maxRows} per import.`,
            );
            return;
          }

          // Validate column headers
          const headers = Object.keys(jsonData[0] || {}).map((h) =>
            h.trim().toLowerCase(),
          );
          const missingRequired = config.columns
            .filter((c) => c.required)
            .filter(
              (c) => !headers.includes(c.excelHeader.trim().toLowerCase()),
            );

          if (missingRequired.length > 0) {
            setParseError(
              `Missing required columns: ${missingRequired.map((c) => `"${c.excelHeader}"`).join(", ")}. Please check your spreadsheet headers match the expected column names.`,
            );
            return;
          }

          // Parse and validate each row
          const rows: ParsedRow[] = jsonData.map((row, index) => {
            const errors: string[] = [];
            const mappedData: Record<string, any> = {};

            // Normalize row keys to lowercase for case-insensitive matching
            const normalizedRow: Record<string, any> = {};
            for (const key of Object.keys(row)) {
              normalizedRow[key.trim().toLowerCase()] = row[key];
            }

            for (const col of config.columns) {
              const headerKey = col.excelHeader.trim().toLowerCase();
              let value = normalizedRow[headerKey];

              // Apply transform
              if (col.transform) {
                try {
                  value = col.transform(value);
                } catch (err: any) {
                  errors.push(
                    `${col.excelHeader}: Transform error — ${err.message}`,
                  );
                }
              }

              // Check required
              if (
                col.required &&
                (value === undefined || value === null || value === "")
              ) {
                errors.push(`${col.excelHeader} is required`);
              }

              // Apply validation
              if (
                col.validate &&
                value !== undefined &&
                value !== null &&
                value !== ""
              ) {
                const validationError = col.validate(value);
                if (validationError) {
                  errors.push(`${col.excelHeader}: ${validationError}`);
                }
              }

              mappedData[col.field] = value;
            }

            return {
              rowNumber: index + 2, // +2 because row 1 is header, data starts at 2
              data: mappedData,
              errors,
              isValid: errors.length === 0,
            };
          });

          setParsedRows(rows);
        } catch (err: any) {
          setParseError(
            `Failed to parse file: ${err.message}. Ensure it's a valid .xlsx or .xls file.`,
          );
        }
      };
      reader.readAsArrayBuffer(f);
    },
    [config.columns, maxRows],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) parseFile(droppedFile);
    },
    [parseFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) parseFile(selected);
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setImporting(true);
    try {
      const result = await onImport(validRows.map((r) => r.data));
      setImportResult(result);
    } catch (err: any) {
      setImportResult({
        success: 0,
        failed: validRows.length,
        errors: [err.message || "Import failed"],
      });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setParseError(null);
    setImportResult(null);
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;
  const previewColumns = config.columns.slice(0, 6); // Show first 6 columns in preview

  // After successful import
  if (importResult && importResult.success > 0 && importResult.failed === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 py-8">
          <HugeiconsIcon icon={CheckCircle2} className="h-12 w-12 text-green-500" />
          <h3 className="text-lg font-semibold">Import Successful!</h3>
          <p className="text-sm text-muted-foreground">
            {importResult.success} {config.entityName.toLowerCase()} imported
            successfully.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleReset}>
            Import More
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  // Import result with some failures
  if (importResult) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 py-4">
          <HugeiconsIcon icon={AlertTriangle} className="h-12 w-12 text-orange-500" />
          <h3 className="text-lg font-semibold">Import Completed</h3>
          <div className="flex gap-4">
            <Badge variant="default" className="bg-green-500">
              {importResult.success} succeeded
            </Badge>
            <Badge variant="destructive">{importResult.failed} failed</Badge>
          </div>
        </div>
        {importResult.errors.length > 0 && (
          <Alert variant="destructive">
            <HugeiconsIcon icon={XCircle} className="h-4 w-4" />
            <AlertTitle>Errors</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 mt-2 space-y-1 max-h-40 overflow-auto text-xs">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleReset}>
            Try Again
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Template download + instructions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Upload an Excel file (.xlsx, .xls) with your{" "}
          {config.entityName.toLowerCase()} data.
        </p>
        {onDownloadTemplate && (
          <Button variant="outline" size="sm" onClick={onDownloadTemplate}>
            <HugeiconsIcon icon={Download} className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        )}
      </div>

      {/* File drop zone */}
      {!file && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("excel-file-input")?.click()}
        >
          <input
            id="excel-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          <HugeiconsIcon icon={Upload} className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">
            Drag & drop your Excel file here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Supports .xlsx, .xls, and .csv files (max {maxRows} rows)
          </p>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={XCircle} className="h-4 w-4" />
          <AlertTitle>Parse Error</AlertTitle>
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {/* File info + parsed data preview */}
      {file && parsedRows.length > 0 && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <HugeiconsIcon icon={FileSpreadsheet} className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedRows.length} rows parsed
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <Badge variant="default" className="bg-green-500">
                      {validCount} valid
                    </Badge>
                    {invalidCount > 0 && (
                      <Badge variant="destructive">
                        {invalidCount} with errors
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <HugeiconsIcon icon={Trash2} className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data preview table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 sticky top-0 bg-background">
                      Row
                    </TableHead>
                    <TableHead className="w-16 sticky top-0 bg-background">
                      Status
                    </TableHead>
                    {previewColumns.map((col) => (
                      <TableHead
                        key={col.field}
                        className="sticky top-0 bg-background"
                      >
                        {col.excelHeader}
                        {col.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((row) => (
                    <TableRow
                      key={row.rowNumber}
                      className={
                        !row.isValid ? "bg-red-50 dark:bg-red-950/20" : ""
                      }
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {row.rowNumber}
                      </TableCell>
                      <TableCell>
                        {row.isValid ? (
                          <HugeiconsIcon icon={CheckCircle2} className="h-4 w-4 text-green-500" />
                        ) : (
                          <span title={row.errors.join("; ")}>
                            <HugeiconsIcon icon={XCircle} className="h-4 w-4 text-red-500" />
                          </span>
                        )}
                      </TableCell>
                      {previewColumns.map((col) => (
                        <TableCell
                          key={col.field}
                          className="text-xs max-w-[150px] truncate"
                        >
                          {String(row.data[col.field] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsedRows.length > 50 && (
              <div className="p-2 text-center text-xs text-muted-foreground border-t">
                Showing 50 of {parsedRows.length} rows
              </div>
            )}
          </div>

          {/* Error summary */}
          {invalidCount > 0 && (
            <Alert variant="destructive">
              <HugeiconsIcon icon={AlertTriangle} className="h-4 w-4" />
              <AlertTitle>{invalidCount} rows have errors</AlertTitle>
              <AlertDescription>
                <p className="mb-2">
                  Only valid rows ({validCount}) will be imported. Rows with
                  errors will be skipped.
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">
                    View errors ({invalidCount})
                  </summary>
                  <ul className="list-disc pl-4 mt-2 space-y-1 max-h-32 overflow-auto">
                    {parsedRows
                      .filter((r) => !r.isValid)
                      .slice(0, 20)
                      .map((row) => (
                        <li key={row.rowNumber}>
                          <span className="font-medium">
                            Row {row.rowNumber}:
                          </span>{" "}
                          {row.errors.join("; ")}
                        </li>
                      ))}
                    {invalidCount > 20 && (
                      <li className="text-muted-foreground">
                        ...and {invalidCount - 20} more
                      </li>
                    )}
                  </ul>
                </details>
              </AlertDescription>
            </Alert>
          )}

          {/* Required columns info */}
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Required columns: </span>
            {config.columns
              .filter((c) => c.required)
              .map((c) => c.excelHeader)
              .join(", ")}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || validCount === 0}
            >
              {importing ? (
                <>
                  <HugeiconsIcon icon={Loader2} className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={Upload} className="h-4 w-4 mr-2" />
                  Import {validCount} {config.entityName}
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Show action buttons when no file selected */}
      {!file && !parseError && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}

      {/* Show retry when parse error */}
      {parseError && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleReset}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
