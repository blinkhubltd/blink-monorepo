import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import type { Id } from "@repo/backend/dataModel";
import { Clock, Search, X } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Input } from "@repo/mobile-ui/components/ui/input";

import { useCart } from "../../providers/CartProvider";
import { useLocation } from "../../providers/LocationProvider";
import {
  ProductCard,
  ProductCardSkeleton,
} from "../../components/product-card";
import { CoverageEmptyState, NeedsLocationState } from "../../components/states";
import { SaveError, SavePrompt } from "../../components/save-prompt";
import { useWishlist } from "../../lib/use-wishlist";
import {
  clearRecentSearches,
  normaliseTerm,
  readRecentSearches,
  saveRecentSearches,
  withRecentSearch,
} from "../../lib/search-history";

/**
 * Search.
 *
 * ── Coverage-aware, unlike the query it would otherwise have used ─────────
 *
 * `products.searchProductsAutocomplete` filters status and stops there. A
 * customer could search, find something stocked only by a shop far outside its
 * own delivery radius, add it, and learn at checkout that nobody can bring it —
 * making the coverage rule the browse flow enforces decorative, since search
 * reaches around it. `catalog.searchProductsByCoverage` applies the same rule.
 *
 * ── Debounced, because each term is a subscription ────────────────────────
 *
 * `useQuery` re-subscribes when its arguments change, so binding it straight to
 * the input opens one subscription per keystroke. The committed term lags the
 * typed one by 350ms; the box itself stays instant.
 *
 * ── Three empty states, all different ────────────────────────────────────
 *
 * Nothing typed, nothing found, and nothing delivers here. The last is about the
 * address rather than the search, and telling them apart is the difference
 * between a customer trying another word and a customer fixing their location.
 */
export default function SearchScreen() {
  const cart = useCart();
  const wishlist = useWishlist();
  const { point, denied, request } = useLocation();

  const [typed, setTyped] = useState("");
  const [committed, setCommitted] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  // Read once on mount. Storage is synchronous, so there is no loading state
  // and no flash of an empty list.
  useEffect(() => setRecent(readRecentSearches()), []);

  useEffect(() => {
    const trimmed = normaliseTerm(typed);
    // Two characters is the shortest term worth a round trip; one letter
    // matches most of the catalogue and reads as noise.
    const next = trimmed.length >= 2 ? trimmed : "";
    if (next === committed) return;
    const timer = setTimeout(() => setCommitted(next), 350);
    return () => clearTimeout(timer);
  }, [typed, committed]);

  const results = useQuery(
    api.data.catalog.searchProductsByCoverage,
    committed && point
      ? { term: committed, lat: point.lat, lng: point.lng }
      : "skip",
  );

  /** Remember a term only once it has actually returned something. */
  useEffect(() => {
    if (!committed || !results || results.products.length === 0) return;
    setRecent((current) => {
      const next = withRecentSearch(current, committed);
      saveRecentSearches(next);
      return next;
    });
  }, [committed, results]);

  const searching = committed.length > 0;

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <View className="px-screen py-space-3 gap-space-2">
        <View className="gap-space-2 flex-row items-center">
          <View className="flex-1">
            <Input
              value={typed}
              onChangeText={setTyped}
              placeholder="Search for anything"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              // Committing on submit as well as on the debounce means the
              // keyboard's Search key does what it says.
              onSubmitEditing={() => setCommitted(normaliseTerm(typed))}
              accessibilityLabel="Search products"
            />
          </View>
          {typed.length > 0 ? (
            <Pressable
              onPress={() => {
                setTyped("");
                setCommitted("");
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              className="size-control items-center justify-center rounded-md active:opacity-70"
            >
              <X size={18} color="#5A6372" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <SavePrompt
        visible={wishlist.requiresSignIn}
        onDismiss={wishlist.dismissSignIn}
      />
      <SaveError message={wishlist.error} onDismiss={wishlist.dismissError} />

      {!point ? (
        // Search needs a location for the same reason browse does: without one
        // there is no way to know which shops can deliver what it finds.
        <NeedsLocationState onRequest={() => void request()} denied={denied} />
      ) : !searching ? (
        <RecentSearches
          terms={recent}
          onPick={(term) => {
            setTyped(term);
            setCommitted(term);
          }}
          onClear={() => {
            clearRecentSearches();
            setRecent([]);
          }}
        />
      ) : results === undefined ? (
        <View className="px-screen gap-space-4 flex-row">
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </View>
      ) : results.coverageEmpty ? (
        <CoverageEmptyState onChangeLocation={() => void request()} />
      ) : results.products.length === 0 ? (
        <View className="gap-space-3 px-screen py-space-10 items-center">
          <Search size={32} color="#818A99" />
          <Text size="lg" weight="semibold" className="text-center">
            Nothing for “{committed}”
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            {results.truncated
              ? "There are more matches than we can rank at once. Try a more specific word."
              : "Try a different word, or browse by category from the Shop tab."}
          </Text>
        </View>
      ) : (
        <FlashList
          data={results.products}
          numColumns={2}
          keyExtractor={(item) => item._id}
          contentContainerClassName="px-screen pb-space-10"
          ItemSeparatorComponent={() => <View className="h-space-4" />}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => (
            <View
              className={
                index % 2 === 0 ? "pr-space-2 flex-1" : "pl-space-2 flex-1"
              }
            >
              <ProductCard
                product={item}
                quantityInCart={cart.quantityOf(item._id as Id<"products">)}
                saved={wishlist.isSaved(item._id)}
                onToggleSave={() =>
                  void wishlist.toggle(item._id as Id<"products">)
                }
                onPress={() => router.push(`/product/${item._id}`)}
                onAdd={() => cart.add(item._id as Id<"products">, 1)}
                onIncrement={() => cart.increment(item._id as Id<"products">)}
                onDecrement={() => cart.decrement(item._id as Id<"products">)}
              />
            </View>
          )}
          ListFooterComponent={
            results.truncated ? (
              // Said rather than implied: the scan is capped, so these are the
              // closest matches and not necessarily all of them.
              <Text size="caption" variant="subtle" className="pt-space-4">
                Showing the closest matches. Add another word to narrow it down.
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function RecentSearches({
  terms,
  onPick,
  onClear,
}: {
  terms: string[];
  onPick: (term: string) => void;
  onClear: () => void;
}) {
  if (terms.length === 0) {
    return (
      <View className="gap-space-3 px-screen py-space-10 items-center">
        <Search size={32} color="#818A99" />
        <Text size="lg" weight="semibold">
          What are you after?
        </Text>
        <Text size="sm" variant="muted" className="text-center">
          Search by product, brand or type. Only shops that deliver to you are
          included.
        </Text>
      </View>
    );
  }

  return (
    <View className="px-screen gap-space-2">
      <View className="flex-row items-center justify-between">
        <Text size="caption" variant="eyebrow">
          Recent
        </Text>
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear recent searches"
          hitSlop={8}
        >
          <Text size="caption" weight="semibold">
            Clear
          </Text>
        </Pressable>
      </View>
      {terms.map((term) => (
        <Pressable
          key={term}
          onPress={() => onPick(term)}
          accessibilityRole="button"
          accessibilityLabel={`Search again for ${term}`}
          className="min-h-control gap-space-3 flex-row items-center active:opacity-70"
        >
          <Clock size={16} color="#818A99" />
          <Text size="sm" numberOfLines={1} className="flex-1">
            {term}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
