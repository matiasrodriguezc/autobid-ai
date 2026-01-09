import logging
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider # <--- IMPORTANTE
from presidio_anonymizer import AnonymizerEngine

# Configuramos logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("privacy_module")

# --- CONFIGURACIÓN PARA RENDER (BAJO CONSUMO) ---
# Forzamos el uso del modelo 'sm' (Small - 12MB) para no saturar la RAM
try:
    nlp_configuration = {
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
    }
    provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
    
    # Iniciamos el motor con la configuración ligera
    analyzer = AnalyzerEngine(nlp_engine=provider.create_engine())
    anonymizer = AnonymizerEngine()
    
    logger.info("🛡️ Motor de Privacidad (Small Model) iniciado correctamente.")
except Exception as e:
    logger.error(f"❌ Error iniciando Presidio: {e}")
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
        # EXCLUIMOS: "PERSON", "LOCATION", "DATE_TIME" para evitar borrar skills.
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
            language='en', 
            entities=allowed_entities, # Mantenemos tu filtro de oro
            score_threshold=0.4 
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