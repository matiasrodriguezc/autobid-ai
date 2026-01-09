import re
import unicodedata

def clean_text_for_rag(text: str) -> str:
    """
    Limpieza agresiva para RAG.
    Objetivo: Que "Campo: Valor\nCampo: Valor" se convierta en "Campo: Valor. Campo: Valor."
    """
    if not text:
        return ""

    # 1. Normalización Unicode (Arregla tildes separadas)
    text = unicodedata.normalize('NFKC', text)

    # 2. Eliminar nulos
    text = text.replace('\x00', '')

    # 3. Unificar saltos de línea (Windows \r\n a Unix \n)
    text = text.replace('\r\n', '\n')

    # 4. ESTRATEGIA DE PÁRRAFOS:
    # Protegemos los saltos dobles (cambio de párrafo real)
    text = re.sub(r'\n\s*\n', '||PARAGRAPH_BREAK||', text)

    # 5. ESTRATEGIA DE RENGLONES (Aquí estaba el problema):
    # Reemplazamos cualquier salto de línea simple por un punto y espacio ". "
    # Esto ayuda a que la IA sepa que terminó una idea, útil para listas como la tuya.
    # O simplemente por espacio " " si prefieres continuidad.
    # En tu caso (Listas clave:valor), un espacio es seguro.
    text = text.replace('\n', ' ') 

    # 6. Limpiar espacios múltiples (Tabs, espacios dobles, etc.)
    # Esto convierte "  " en " "
    text = re.sub(r'\s+', ' ', text)

    # 7. Restaurar párrafos
    text = text.replace('||PARAGRAPH_BREAK||', '\n\n')

    return text.strip()