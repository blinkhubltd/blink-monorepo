import { Pressable, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Id } from "@repo/backend/dataModel";
import { Icon } from "../components/icon";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Input } from "@repo/mobile-ui/components/ui/input";

import { useCart } from "../providers/CartProvider";
import { useLocation } from "../providers/LocationProvider";
import { ProductCard, ProductCardSkeleton } from "../components/product-card";
import { CoverageEmptyState, NeedsLocationState } from "../components/states";
import { SaveError, SavePrompt } from "../components/save-prompt";
import { ScreenHeader } from "../components/screen-header";
import { useWishlist } from "../lib/use-wishlist";
import { useProductSearch } from "../lib/use-product-search";

/**
 * Search.
 *
 * ── A pushed route, not a tab ─────────────────────────────────────────────
 *
 * The four tabs are Home, Wishlist, Orders and Profile, matching the app this
 * replaces — which reached search from a control in the catalogue header rather
 * than from the tab bar.
 *
 * The URL is still `/search`. expo-router groups are path-transparent, so moving
 * this file out of `(tabs)/` changed what wraps it, not what addresses it:
 * existing links, the header's push, and `blink://search` are all unaffected.
 *
 * Accepts `?q=` so the header's field can hand over a term it has already
 * collected rather than making the customer type it twice.
 *
 * ── The rules live in lib/use-product-search.ts ───────────────────────────
 *
 * The debounce, the minimum term length, the coverage query and the recent list
 * are all in that hook, so the header's field is a second renderer rather than a
 * second implementation. The comment there records what went wrong last time.
 *
 * ── Three empty states, all different ─────────────────────────────────────
 *
 * Nothing typed, nothing found, and nothing delivers here. The last is about the
 * address rather than the search, and telling them apart is the difference
 * between a customer trying another word and a customer fixing their location.
 */
export default function SearchScreen() {
  const cart = useCart();
  const wishlist = useWishlist();
  const { point, denied, request } = useLocation();
  const { q } = useLocalSearchParams<{ q?: string }>();

  const search = useProductSearch({ point, initialTerm: q ?? "" });
  const { results } = search;

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      {/*
        A back affordance, which this screen did not need while it was a tab and
        does need now that it is pushed over the catalogue — Android's hardware
        back should not be the only way out.
      */}
      <ScreenHeader title="Search" showCart />

      <View className="px-screen py-space-3 gap-space-2">
        <View className="gap-space-2 flex-row items-center">
          <View className="flex-1">
            <Input
              value={search.typed}
              onChangeText={search.setTyped}
              placeholder="Search for anything"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              // Arriving without a term means the customer came here to type.
              autoFocus={!q}
              // Committing on submit as well as on the debounce means the
              // keyboard's Search key does what it says.
              onSubmitEditing={search.submit}
              accessibilityLabel="Search products"
            />
          </View>
          {search.typed.length > 0 ? (
            <Pressable
              onPress={search.clear}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              className="size-control items-center justify-center rounded-md active:opacity-70"
            >
              <Icon name="close" size={18} tone="body" />
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
      ) : !search.searching ? (
        <RecentSearches
          terms={search.recent}
          onPick={search.pick}
          onClear={search.forgetRecent}
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
          <Icon name="search-outline" size={32} tone="subtle" />
          <Text size="lg" weight="semibold" className="text-center">
            Nothing for “{search.committed}”
          </Text>
          <Text size="sm" variant="muted" className="text-center">
            {results.truncated
              ? "There are more matches than we can rank at once. Try a more specific word."
              : "Try a different word, or browse by category from the Home tab."}
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
        <Icon name="search-outline" size={32} tone="subtle" />
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
          <Icon name="time-outline" size={16} tone="subtle" />
          <Text size="sm" numberOfLines={1} className="flex-1">
            {term}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
