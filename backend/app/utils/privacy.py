import logging
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

# Configuramos logs para ver qué está censurando
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("privacy_module")

# Inicializamos los motores de Presidio (Singleton pattern implícito al importar)
# Esto carga el modelo de NLP en memoria una sola vez.
try:
    analyzer = AnalyzerEngine()
    anonymizer = AnonymizerEngine()
    logger.info("🛡️ Motor de Privacidad (Microsoft Presidio) iniciado correctamente.")
except Exception as e:
    logger.error(f"❌ Error iniciando Presidio. Asegúrate de haber instalado el modelo spacy: {e}")
    analyzer = None
    anonymizer = None

def sanitize_text(text: str) -> str:
    """
    Detecta y anonimiza datos sensibles (PII).
    Versión ajustada para evitar falsos positivos en CVs técnicos.
    Solo censura: Emails, Teléfonos, Tarjetas, Crypto, IPs.
    """
    if not text or not analyzer:
        return text

    try:
        # Definimos explícitamente qué queremos buscar.
        # EXCLUIMOS: "PERSON", "LOCATION", "DATE_TIME", "NRP", "US_DRIVER_LICENSE"
        # para evitar que borre skills como "Docker", "Java" o fechas importantes.
        allowed_entities = [
            "EMAIL_ADDRESS", 
            "PHONE_NUMBER", 
            "CREDIT_CARD", 
            "CRYPTO", 
            "IBAN",
            "IP_ADDRESS",
            "US_PASSPORT",
            "US_SSN"
        ]

        # 1. Análisis
        results = analyzer.analyze(
            text=text, 
            language='en', # Usamos el modelo cargado (en_core_web_lg)
            entities=allowed_entities, # <--- EL FILTRO DE ORO
            score_threshold=0.4 # Solo censura si está 40% seguro
        )

        # 2. Anonimización
        anonymized_result = anonymizer.anonymize(
            text=text,
            analyzer_results=results
        )
        
        return anonymized_result.text

    except Exception as e:
        logger.error(f"⚠️ Error sanitizando texto: {e}")
        return text