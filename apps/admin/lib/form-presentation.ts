/**
 * How a module's create/edit/view form is presented.
 *
 * - `sheet` — a right-side slide-over, cleaner and more responsive than a
 *   `Dialog` for most forms, and the default every module gets for free.
 * - `full`  — takes over the content area as a full page, in place of the
 *   table. For a resource whose form is genuinely dense (categories,
 *   products — image uploads, pickers, many fields), a sheet is cramped
 *   regardless of width; a full page gives it room without leaving the app.
 *
 * This is a prop passed to `FormShell`/`useModuleForm`, not a user-facing
 * toggle — each module's own `page.tsx` decides, once, which it needs.
 */
export type FormPresentation = "sheet" | "full";

/** Module-wide default. Override per module with `useModuleForm({ presentation: "full" })`. */
export const FORM_PRESENTATION: FormPresentation = "sheet";
