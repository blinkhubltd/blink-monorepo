import { Image, type ImageProps } from "expo-image";
import { cssInterop } from "nativewind";
import { cn } from "../../lib/utils";

/**
 * `expo-image`'s `Image` is not one of the core `react-native` host
 * components NativeWind auto-instruments, so without this, every `className`
 * passed to it anywhere in either app was silently a no-op string prop —
 * no width, no height, no padding, nothing ever reached a real style object.
 * The image itself rendered at zero effective size, which is
 * indistinguishable from "the image never loaded": the surrounding
 * placeholder `View`'s own background is all that was ever visible.
 */
cssInterop(Image, { className: "style" });

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
