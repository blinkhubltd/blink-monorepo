const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (!domain) {
  throw new Error(
    "Missing CLERK_JWT_ISSUER_DOMAIN. Set it in your Convex environment to match your Clerk project, e.g. https://<your-slug>.clerk.accounts.dev"
  );
}

export default {
  providers: [
    {
      // Clerk provider configuration
      domain,
      applicationID: "convex",
    },
  ]
};
