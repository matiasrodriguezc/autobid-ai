from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# Crear el motor de conexión
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # <--- LA CLAVE: "Toca el timbre" antes de entrar
    pool_recycle=300,    # Recicla conexiones cada 5 minutos (300 seg)
    pool_size=5,         # Mantiene 5 conexiones listas
    max_overflow=10      # Permite hasta 10 extra si hay tráfico
)

# Crear la fábrica de sesiones (cada petición tendrá su propia sesión)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base para los modelos (tablas)
Base = declarative_base()

# Dependencia para inyectar la DB en los endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()