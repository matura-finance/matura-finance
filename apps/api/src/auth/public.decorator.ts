import { SetMetadata } from "@nestjs/common";

/** Reflector metadata key marking a route (or controller) as unauthenticated. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route or controller as public, bypassing the global {@link WalletAuthGuard}.
 * Everything is authenticated by default (fail-closed); opt out explicitly with `@Public()`.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
