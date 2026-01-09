import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)']);

// 1. Agregamos 'async' antes de los argumentos
export default clerkMiddleware(async (auth, req) => {
  // 2. Agregamos 'await' antes de llamar a auth() y encerramos en paréntesis si es necesario
  // O simplemente esperamos el objeto auth y luego ejecutamos protect
  if (isProtectedRoute(req)) {
    await auth.protect(); 
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};