import { Image, type ImageProps } from "expo-image";
import { cn } from "../../lib/utils";

/**
 * expo-image with the DS defaults: the grey plate behind a cutout, a 12px
 * thumb radius and the 160ms fade the DS specifies for image-in transitions.
 */
interface OptimizedImageProps extends Omit<ImageProps, "className"> {
  className?: string;
}

function OptimizedImage({
  className,
  contentFit = "contain",
  transition = 160,
  ...props
}: OptimizedImageProps) {
  return (
    <Image
      className={cn("rounded-md bg-secondary", className)}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      {...props}
    />
  );
}

export { OptimizedImage };
