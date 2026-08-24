export function maskPhone(phone: string | undefined): string {
  if (!phone) return "N/A";

  const cleaned = phone.replace(/\s/g, "");

  if (cleaned.length < 6) {
    return "XXX...XXX";
  }

  const prefix = cleaned.slice(0, 4);
  const suffix = cleaned.slice(-3);

  return `${prefix}XXX...${suffix}`;
}

export function maskEmail(email: string | undefined): string {
  if (!email) return "N/A";

  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return "***@***";
  }

  // Show first 2 chars of local part
  const visibleChars = Math.min(2, localPart.length);
  const maskedLocal = localPart.slice(0, visibleChars) + "***";

  return `${maskedLocal}@${domain}`;
}
