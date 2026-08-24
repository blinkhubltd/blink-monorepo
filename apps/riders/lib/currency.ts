export const CURRENCY = {
  CODE: "KES",
  SYMBOL: "Ksh",
  DECIMAL_PLACES: 2,
} as const;

export function formatKES(
  amount: number,
  options: {
    showSymbol?: boolean;
    decimalPlaces?: number;
    useCommas?: boolean;
  } = {}
): string {
  const {
    showSymbol = true,
    decimalPlaces = CURRENCY.DECIMAL_PLACES,
    useCommas = true,
  } = options;

  const formattedAmount = useCommas
    ? amount.toLocaleString("en-KE", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      })
    : amount.toFixed(decimalPlaces);

  return showSymbol ? `${CURRENCY.SYMBOL} ${formattedAmount}` : formattedAmount;
}
