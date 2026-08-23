# Shared Convex Backend Setup

## Overview
Both [blink-admin](https://github.com/pardiprai/blink-admin) and [blink-riders](https://github.com/pardiprai/blink-rider) now share the same Convex backend through a git submodule pointing to this repository.

## Repository Structure
- **blink-admin**: Uses this shared convex as a submodule at `/convex`.
- **blink-riders**: Uses this shared convex as a submodule at `/convex`

## Key Benefits
1. **Single source of truth**: Both apps use this exact same backend code
2. **Synchronized updates**: Changes to this backend are shared between both apps
3. **Type safety**: Both apps share the same TypeScript types from Convex
4. **Single deployment**: Run one Convex dev server that both apps connect to

## Common Commands

### Running the Convex Dev Server
From either project root:
```powershell
npx convex dev
```

### Updating Shared Convex Code
1. Navigate to the convex submodule:
```powershell
cd convex
```

2. Make your changes and commit:
```powershell
git add .
git commit -m "Your changes"
git push
```

3. Update the parent repository:
```powershell
cd ..
git add convex
git commit -m "Update convex submodule"
git push
```

### Pulling Latest Convex Changes
To get the latest shared convex code in your project:

```powershell
cd convex
git pull origin main
cd ..
git add convex
git commit -m "Update convex submodule to latest"
git push
```

### After Cloning a Repository
After cloning blink-admin or blink-riders, initialize the submodule:

```powershell
git submodule update --init --recursive
```

## Environment Variables
Make sure your Convex environment variables are set:

```powershell
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://definite-bluegill-19.clerk.accounts.dev"
npx convex env set CLERK_WEBHOOK_SECRET "whsec_..."  # your actual webhook secret
```

## Import Paths
In your TypeScript/JavaScript files, import convex functions and types:

```typescript
import { api } from '@/convex/_generated/api';
import { Doc, Id } from '@/convex/_generated/dataModel';
```

## Troubleshooting

### Submodule not initialized
If you see an empty convex folder:
```powershell
git submodule update --init --recursive
```

### Submodule out of sync
To update to the latest commit on main:
```powershell
git submodule update --remote convex
```

### Schema validation errors
If you encounter schema validation errors, ensure the validators in `convex/validators.ts` match your actual data structure.

## Notes
- The shared repository structure has been flattened (no nested convex/convex folders)
- Both apps must use the same Convex deployment URL
- Changes to the Convex backend affect both apps immediately
