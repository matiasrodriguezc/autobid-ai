import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"

export default function SSOCallback() {
  // Este componente maneja la redirección automáticamente
  return <AuthenticateWithRedirectCallback />
}