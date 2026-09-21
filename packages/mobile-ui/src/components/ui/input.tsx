import { TextInput, View, type TextInputProps } from "react-native";
import { cn } from "../../lib/utils";
import { Text } from "./text";

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  /** Rendered inside the field, before the text. */
  icon?: React.ReactNode;
  containerClassName?: string;
}

function Input({
  className,
  containerClassName,
  label,
  error,
  icon,
  editable = true,
  ...props
}: InputProps) {
  return (
    <View className={cn("gap-space-2", containerClassName)}>
      {label ? (
        <Text variant="eyebrow" size="label">
          {label}
        </Text>
      ) : null}
      <View
        className={cn(
          // A real 1px border, not `border-hairline` (RN's sub-pixel
          // StyleSheet.hairlineWidth, ~0.33px on most screens): a field's
          // border is the only thing telling a user where to type, and a
          // hairline in a light neutral tone anti-aliased away to nothing.
          "h-control flex-row items-center gap-space-3 rounded-md border bg-card px-space-4",
          error ? "border-destructive" : "border-input",
          !editable && "opacity-60",
        )}
      >
        {icon}
        <TextInput
          className={cn(
            "flex-1 font-sans text-body text-foreground",
            className,
          )}
          placeholderTextColor="#818A99"
          editable={editable}
          {...props}
        />
      </View>
      {error ? (
        <Text variant="destructive" size="caption">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export { Input };
