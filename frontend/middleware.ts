import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)']);

// 1. AÑADIDO 'async' AQUÍ 👇
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    
    // 2. AÑADIDO 'await' AQUÍ 👇
    // TypeScript se quejaba porque intentabas leer datos de una Promesa sin resolver.
    const { userId, redirectToSignIn } = await auth();

    if (!userId) {
      return redirectToSignIn();
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};