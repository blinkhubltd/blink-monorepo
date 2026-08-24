import { View, type ViewProps } from "react-native";
import { Image } from "expo-image";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Text } from "./text";

const avatarVariants = cva(
  "items-center justify-center overflow-hidden rounded-pill bg-secondary",
  {
    variants: {
      size: {
        sm: "h-space-8 w-space-8",
        default: "h-control w-control",
        lg: "h-space-11 w-space-11",
      },
    },
    defaultVariants: { size: "default" },
  },
);

interface AvatarProps extends ViewProps, VariantProps<typeof avatarVariants> {
  uri?: string | null;
  /** Shown when there is no image. Derived from a name by the caller. */
  fallback: string;
}

function Avatar({ uri, fallback, size, className, ...props }: AvatarProps) {
  return (
    <View className={cn(avatarVariants({ size }), className)} {...props}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={160}
        />
      ) : (
        <Text variant="heading" size="sm">
          {fallback}
        </Text>
      )}
    </View>
  );
}

export { Avatar, avatarVariants };
