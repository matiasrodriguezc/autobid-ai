from pypdf import PdfReader
from fastapi import UploadFile
import io

# 1. Importamos la función de limpieza que creaste en el paso anterior
from app.utils.text_processing import clean_text_for_rag

def extract_text_from_pdf(file: UploadFile) -> str:
    """
    Extrae y LIMPIA texto de un archivo PDF subido vía FastAPI.
    """
    try:
        # Aseguramos cursor al inicio
        file.file.seek(0)
        
        content = file.file.read()
        pdf_stream = io.BytesIO(content)
        
        reader = PdfReader(pdf_stream)
        text = ""
        
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                # Concatenamos todo el texto crudo primero
                text += extracted + "\n"
        
        # 2. MAGIA AQUÍ: Pasamos el texto crudo por tu filtro de limpieza
        # Esto arregla las tildes, une palabras cortadas y arregla saltos de línea.
        clean_text = clean_text_for_rag(text)
                
        return clean_text

    except Exception as e:
        print(f"Error parseando PDF: {e}")
        return ""
    finally:
        file.file.seek(0)