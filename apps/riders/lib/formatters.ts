export const formatAddress = (address: any) => {
  if (!address) return undefined;

  const parts = [
    address.address_1,
    address.address_2,
    address.city,
    address.country,
  ].filter(Boolean);

  return parts.join(", ");
};

export const formatServiceRadius = (radius: number) => {
  return `${radius} km radius`;
};
