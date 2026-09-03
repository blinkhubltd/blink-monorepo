import { ScrollViewStyleReset } from "expo-router/html";

/**
 * The root HTML shell for web only — Expo Router statically renders this
 * around every web page. It never runs on native, and it has no access to the
 * DOM or browser APIs at render time (it runs in Node during the static
 * build), so nothing here can read `window`, storage, or the color scheme at
 * request time — only what CSS itself can express.
 *
 * ── Why the background colours are hardcoded, not read from a token ───────
 *
 * There is no build step here that could import `global.css`'s custom
 * properties and have them apply before that stylesheet itself loads — so the
 * values below are copied from it (`--color-background` in `global.css`) by
 * hand. If those tokens change, this file needs updating too; there is no way
 * to make one the source of truth for the other without introducing a build
 * step this file cannot have. Cheap to get wrong, cheap to grep for and fix.
 *
 * The point of setting it at all: without it, the page is transparent for the
 * one frame between the browser painting `<body>` and React hydrating the
 * NativeWind background class onto it — a white (or black, or wrong-colour)
 * flash on every load.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>Blink</title>

        {/*
          Disable body scrolling on web so ScrollView components behave closer
          to how they do on native. Body scrolling is often nicer on mobile
          web — remove this if that trade is wrong for this app.
        */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: RESPONSIVE_BACKGROUND }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const RESPONSIVE_BACKGROUND = `
body {
  background-color: #f8fafd; /* --color-background, light — global.css */
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #0a0e16; /* --color-background, .dark — global.css */
  }
}`;
