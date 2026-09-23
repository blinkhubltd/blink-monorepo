import { Input } from "../form-field";

/**
 * The auth flow's text field.
 *
 * This was once the only pill field in the app, and the whole spec lived
 * here. It does not any more: every form in the shop now uses that shape, so
 * the implementation moved to `components/form-field.tsx` — see its header
 * for the spec and for why the deviation stopped being one.
 *
 * The name survives because the three auth screens read better for it, and
 * because `label` is required here where it is optional there: a field on a
 * sign-in screen with no label above it is not a thing this flow has.
 */
export function PillField(
  props: React.ComponentProps<typeof Input> & { label: string },
) {
  return <Input {...props} />;
}
