"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon as ChevronRight } from "@hugeicons/core-free-icons";
import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Label } from "@repo/ui/components/ui/label";
import { cn } from "@/lib/utils";

export interface CascadingOption {
  value: string;
  label: string;
  children?: CascadingOption[];
}

interface CascadingSelectProps {
  options: CascadingOption[];
  value?: string;
  onValueChange: (value: string, path: CascadingOption[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  loadChildren?: (parentId: string) => Promise<CascadingOption[]>;
}

export function CascadingSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option",
  className,
  disabled = false,
  loadChildren,
}: CascadingSelectProps) {
  const [selectedPath, setSelectedPath] = useState<CascadingOption[]>([]);
  const [currentLevelOptions, setCurrentLevelOptions] = useState<
    CascadingOption[][]
  >([options]);
  const [isLoading, setIsLoading] = useState(false);

  // Find the path to the selected value when component mounts or value changes
  useEffect(() => {
    if (value && options.length > 0) {
      const path = findPathToValue(options, value);
      if (path.length > 0) {
        setSelectedPath(path);
        buildLevelOptions(path);
      }
    } else if (!value) {
      setSelectedPath([]);
      setCurrentLevelOptions([options]);
    }
  }, [value, options]);

  const findPathToValue = (
    items: CascadingOption[],
    targetValue: string
  ): CascadingOption[] => {
    for (const item of items) {
      if (item.value === targetValue) {
        return [item];
      }
      if (item.children) {
        const childPath = findPathToValue(item.children, targetValue);
        if (childPath.length > 0) {
          return [item, ...childPath];
        }
      }
    }
    return [];
  };

  const buildLevelOptions = async (path: CascadingOption[]) => {
    const levels: CascadingOption[][] = [options];

    for (let i = 0; i < path.length; i++) {
      const currentItem = path[i];
      // The loop bound is path.length so this is always present, but the
      // compiler cannot know that and a silent skip is safer than a cast.
      if (!currentItem) continue;
      let children: CascadingOption[] = [];

      if (currentItem.children) {
        children = currentItem.children;
      } else if (loadChildren) {
        setIsLoading(true);
        try {
          children = await loadChildren(currentItem.value);
        } catch (error) {
          console.error("Error loading children:", error);
        } finally {
          setIsLoading(false);
        }
      }

      if (children.length > 0) {
        levels.push(children);
      }
    }

    setCurrentLevelOptions(levels);
  };

  const handleSelectionChange = async (
    selectedValue: string,
    levelIndex: number
  ) => {
    const currentLevelItems = currentLevelOptions[levelIndex];
    // levelIndex comes from a rendered Select, and the options array is rebuilt
    // asynchronously in buildLevelOptions — so a change landing mid-rebuild can
    // index past the end. Previously that threw inside the handler.
    if (!currentLevelItems) return;
    const selectedItem = currentLevelItems.find(
      (item) => item.value === selectedValue
    );

    if (!selectedItem) return;

    // Build new path up to this level
    const newPath = [...selectedPath.slice(0, levelIndex), selectedItem];
    setSelectedPath(newPath);

    // Check if this item has children or can load children
    let hasChildren = false;
    let children: CascadingOption[] = [];

    if (selectedItem.children && selectedItem.children.length > 0) {
      children = selectedItem.children;
      hasChildren = true;
    } else if (loadChildren) {
      setIsLoading(true);
      try {
        children = await loadChildren(selectedItem.value);
        hasChildren = children.length > 0;
      } catch (error) {
        console.error("Error loading children:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (hasChildren) {
      // Update levels to show children
      const newLevels = [
        ...currentLevelOptions.slice(0, levelIndex + 1),
        children,
      ];
      setCurrentLevelOptions(newLevels);
    } else {
      // This is a leaf node, finalize selection
      setCurrentLevelOptions(currentLevelOptions.slice(0, levelIndex + 1));
      onValueChange(selectedItem.value, newPath);
    }
  };

  const getDisplayPath = () => {
    return selectedPath.map((item) => item.label).join(" > ");
  };

  const getLevelLabel = (levelIndex: number) => {
    const labels = ["Category", "Subcategory", "Sub-subcategory", "Type"];
    return labels[levelIndex] || `Level ${levelIndex + 1}`;
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Display selected path */}
      {selectedPath.length > 0 && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md border">
          <span className="font-medium">Selected: </span>
          <span className="text-foreground">{getDisplayPath()}</span>
        </div>
      )}

      {/* Render cascading selects */}
      <div className="space-y-3">
        {currentLevelOptions.map((levelOptions, levelIndex) => {
          const currentValue = selectedPath[levelIndex]?.value || "";
          const isLastLevel = levelIndex === selectedPath.length;
          const hasOptions = levelOptions.length > 0;

          return (
            <div key={levelIndex} className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                {levelIndex > 0 && (
                  <HugeiconsIcon icon={ChevronRight} className="h-3 w-3 text-muted-foreground" />
                )}
                {getLevelLabel(levelIndex)}
                {levelIndex === 0 && <span className="text-red-500">*</span>}
              </Label>

              <Select
                value={currentValue}
                onValueChange={(value) =>
                  handleSelectionChange(value, levelIndex)
                }
                disabled={disabled || isLoading || !hasOptions}
              >
                <SelectTrigger
                  className={cn(
                    "transition-colors",
                    !hasOptions && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <SelectValue
                    placeholder={
                      isLoading
                        ? "Loading..."
                        : !hasOptions
                          ? "No options available"
                          : levelIndex === 0
                            ? placeholder
                            : `Select ${getLevelLabel(levelIndex).toLowerCase()}`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {hasOptions ? (
                    levelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>
                      No options available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {/* Show loading indicator for async operations */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
          Loading categories...
        </div>
      )}
    </div>
  );
}
