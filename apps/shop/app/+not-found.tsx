import { router } from "expo-router";
import { NotFoundState } from "../components/states";

export default function NotFoundScreen() {
  return <NotFoundState what="page" onBack={() => router.replace("/")} />;
}
