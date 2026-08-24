"use client";
// Exporting both named and default under the same identifier twice was causing
// a double Object.defineProperty on the module exports which can surface
// "TypeError: property is not configurable" in Metro when reloading.
// Keep a single, clear export to avoid redefining.
export { StatusBar } from "react-native";
export { default as StatusBarManager } from "./StatusBarManager";
