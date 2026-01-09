from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

# Este esquema le dice a Swagger UI que esperamos un token "Bearer"
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Decodifica el token de Clerk y extrae el ID de usuario (user_id).
    """
    token = credentials.credentials
    try:
        # NOTA DE SEGURIDAD: 
        # En producción, deberíamos verificar la firma criptográfica con la clave pública de Clerk.
        # Para desarrollo rápido, decodificamos los claims sin verificar la firma (confiando en que Clerk lo generó).
        payload = jwt.get_unverified_claims(token)
        
        # 'sub' es el estándar para el ID único del usuario (Subject)
        user_id = payload.get("sub")
        
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido: No contiene ID de usuario"
            )
            
        return user_id

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo validar las credenciales"
        )