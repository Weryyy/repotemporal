# Guía Completa: Detección Facial con Amazon Rekognition

## Índice
1. [Introducción](#introducción)
2. [¿Qué es Amazon Rekognition?](#qué-es-amazon-rekognition)
3. [Conceptos Clave](#conceptos-clave)
4. [Flujo del Laboratorio](#flujo-del-laboratorio)
5. [Explicación Detallada del Código](#explicación-detallada-del-código)
6. [Casos de Uso Reales](#casos-de-uso-reales)
7. [Mejores Prácticas](#mejores-prácticas)
8. [Preguntas Frecuentes](#preguntas-frecuentes)

---

## Introducción

Este laboratorio forma parte de un curso de **AWS** y está diseñado para enseñar cómo utilizar **Amazon Rekognition** para realizar detección y reconocimiento facial. El objetivo es comprender cómo crear una colección de rostros, indexar imágenes y buscar coincidencias en nuevas fotografías.

### Objetivos de Aprendizaje
- Comprender el funcionamiento de Amazon Rekognition
- Crear y gestionar colecciones de rostros
- Detectar rostros en imágenes
- Comparar rostros entre diferentes imágenes
- Visualizar resultados con cuadros delimitadores

---

## ¿Qué es Amazon Rekognition?

**Amazon Rekognition** es un servicio de AWS que facilita la incorporación de análisis de imágenes y videos a las aplicaciones. Utiliza tecnología de deep learning y no requiere experiencia en machine learning para su uso.

### Características principales:
- **Detección de objetos y escenas**
- **Reconocimiento facial**
- **Análisis de sentimientos faciales**
- **Detección de texto en imágenes**
- **Moderación de contenido**
- **Detección de celebridades**

---

## Conceptos Clave

### 1. Colección (Collection)
Una **colección** es un contenedor que almacena información de rostros detectados. No almacena las imágenes originales, sino vectores de características (embeddings) que representan cada rostro.

### 2. Face ID
Identificador único asignado por Rekognition a cada rostro indexado en una colección.

### 3. External Image ID
Identificador personalizado que tu aplicación asigna a una imagen al indexarla.

### 4. BoundingBox
Coordenadas normalizadas (valores entre 0 y 1) que indican la ubicación de un rostro en una imagen:
- `Left`: Posición horizontal del borde izquierdo
- `Top`: Posición vertical del borde superior
- `Width`: Ancho del rectángulo
- `Height`: Alto del rectángulo

### 5. Similarity (Similitud)
Porcentaje que indica qué tan parecidos son dos rostros (0-100%).

---

## Flujo del Laboratorio

```
┌─────────────────┐
│   1. Crear      │
│   Colección     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. Cargar      │
│  Imagen (mum)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. Indexar     │
│  Rostro         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. Visualizar  │
│  BoundingBox    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  5. Listar      │
│  Rostros        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  6. Buscar      │
│  en target.jpg  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  7. Visualizar  │
│  Coincidencia   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  8. Eliminar    │
│  Colección      │
└─────────────────┘
```

---

## Explicación Detallada del Código

### Paso 1: Importación de Librerías

**Código del notebook sin resolver:**
```python
from skimage import io
from skimage.transform import rescale
from matplotlib import pyplot as plt

import boto3

import numpy as np

from PIL import Image, ImageDraw, ImageColor, ImageOps
```

**Código de la solución (mejorado):**
```python
from skimage import io
from skimage.transform import rescale
from matplotlib import pyplot as plt

import boto3

import numpy as np

from PIL import Image, ImageDraw, ImageColor, ImageOps

# Para manejo de errores de AWS
from botocore.exceptions import ClientError

print("✅ Librerías importadas correctamente")
```

**Explicación:**
| Librería | Propósito |
|----------|-----------|
| `skimage.io` | Lectura de imágenes |
| `skimage.transform.rescale` | Redimensionar imágenes |
| `matplotlib.pyplot` | Visualización de imágenes |
| `boto3` | SDK de AWS para Python |
| `numpy` | Operaciones con arrays |
| `PIL` | Manipulación y dibujo sobre imágenes |
| `botocore.exceptions` | Manejo de errores de AWS |

---

### Paso 2: Crear una Colección

**Código del notebook sin resolver:**
```python
client = boto3.client('rekognition')
collection_id = 'Collection'
response = client.create_collection(CollectionId=collection_id)
print('Collection ARN: ' + response['CollectionArn'])
print('Status Code:' + str(response['StatusCode']))
print('Done...')
```

**Código de la solución (con manejo de errores):**
```python
client = boto3.client('rekognition')
collection_id = 'Collection'

try:
    response = client.create_collection(CollectionId=collection_id)
    print('✅ Colección creada exitosamente')
    print('Collection ARN: ' + response['CollectionArn'])
    print('Status Code: ' + str(response['StatusCode']))
except ClientError as e:
    if e.response['Error']['Code'] == 'ResourceAlreadyExistsException':
        print('⚠️ La colección ya existe, continuando...')
    else:
        raise e
```

**Explicación:**
- `boto3.client('rekognition')`: Crea un cliente para interactuar con el servicio Rekognition
- `create_collection()`: Crea una nueva colección vacía
- **Collection ARN**: Amazon Resource Name, identificador único del recurso en AWS
- **Status Code 200**: Indica éxito en la operación

---

### Paso 3: Cargar y Preparar la Imagen

**Código del notebook:**
```python
filename = "mum.jpg"
faceimage = io.imread(filename)
plt.imshow(faceimage)
```

**Código para redimensionar (si es necesario):**
```python
# Verificar tamaño (límite: 4096x4096)
if height > 4096 or width > 4096:
    faceimage = rescale(faceimage, 0.50, mode='constant')
    io.imsave(filename, faceimage)
```

**Explicación:**
- Amazon Rekognition tiene un límite de **4096 x 4096 píxeles**
- Si la imagen excede este tamaño, se debe escalar
- El factor `0.50` reduce la imagen al 50% de su tamaño original

---

### Paso 4: Indexar el Rostro

**Código del notebook sin resolver:**
```python
externalimageid = filename

with open(filename, 'rb') as fimage:
    response = client.index_faces(CollectionId = collection_id,
                             Image={'Bytes': fimage.read()},
                             ExternalImageId=externalimageid,
                             MaxFaces=1,
                             QualityFilter="AUTO",
                             DetectionAttributes=['ALL'])
```

**Explicación de parámetros:**

| Parámetro | Descripción |
|-----------|-------------|
| `CollectionId` | ID de la colección donde se almacenará |
| `Image` | La imagen en bytes |
| `ExternalImageId` | Identificador personalizado |
| `MaxFaces` | Máximo de rostros a indexar (1 en este caso) |
| `QualityFilter` | "AUTO" filtra rostros de baja calidad |
| `DetectionAttributes` | "ALL" detecta todos los atributos faciales |

**Respuesta de la API:**
```json
{
  "FaceRecords": [
    {
      "Face": {
        "FaceId": "abc123...",
        "BoundingBox": {
          "Left": 0.25,
          "Top": 0.15,
          "Width": 0.50,
          "Height": 0.60
        },
        "Confidence": 99.98
      }
    }
  ],
  "UnindexedFaces": []
}
```

---

### Paso 5: Dibujar el Cuadro Delimitador

**Código del notebook sin resolver:**
```python
img = Image.open(filename)
imgWidth, imgHeight = img.size

draw = ImageDraw.Draw(img)
for faceRecord in response['FaceRecords']:
    box = faceRecord['Face']['BoundingBox']
    left = imgWidth * box['Left']
    top = imgHeight * box['Top']
    width = imgWidth * box['Width']
    height = imgHeight * box['Height']

    points = ((left,top),(left+width,top),(left+width,top+height),(left,top+height),(left,top))

    draw.line(points,fill='#00d400', width=15)
    
plt.imshow(img)
```

**Explicación del cálculo de coordenadas:**

Las coordenadas del BoundingBox están **normalizadas** (valores entre 0 y 1):

```
Coordenada Pixel = Coordenada Normalizada × Dimensión Imagen

left   = BoundingBox.Left × imgWidth
top    = BoundingBox.Top × imgHeight
width  = BoundingBox.Width × imgWidth
height = BoundingBox.Height × imgHeight
```

**Visualización del BoundingBox:**
```
(left, top) ─────────────────── (left+width, top)
     │                                │
     │                                │
     │         ROSTRO                 │
     │                                │
     │                                │
(left, top+height) ─────── (left+width, top+height)
```

---

### Paso 6: Listar Rostros en la Colección

**Código del notebook sin resolver:**
```python
maxResults=2
faces_count=0
tokens=True

response=client.list_faces(CollectionId=collection_id,
                           MaxResults=maxResults)

while tokens:
    faces=response['Faces']
    for face in faces:
        print (face)
        faces_count+=1
    if 'NextToken' in response:
        nextToken=response['NextToken']
        response=client.list_faces(CollectionId=collection_id,
                                   NextToken=nextToken,MaxResults=maxResults)
    else:
        tokens=False
```

**Explicación:**
- `list_faces()` retorna los rostros almacenados en una colección
- Usa **paginación** para manejar colecciones grandes
- `NextToken` permite obtener la siguiente página de resultados
- `MaxResults` limita cuántos resultados se obtienen por llamada

---

### Paso 7: Buscar Rostros en Nueva Imagen

**Código del notebook sin resolver:**
```python
threshold = 70
maxFaces=2

with open(targetfilename, 'rb') as timage:        
    response2=client.search_faces_by_image(CollectionId=collection_id,
                            Image={'Bytes': timage.read()},
                            FaceMatchThreshold=threshold,
                            MaxFaces=maxFaces)

faceMatches=response2['FaceMatches']
for match in faceMatches:
    print ('FaceId:' + match['Face']['FaceId'])
    print ('Similarity: ' + "{:.2f}".format(match['Similarity']) + "%")
    print ('ExternalImageId: ' + match['Face']['ExternalImageId'])
```

**Parámetros clave:**

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `FaceMatchThreshold` | 70 | Solo retorna coincidencias con ≥70% similitud |
| `MaxFaces` | 2 | Máximo de coincidencias a retornar |

**Interpretación del resultado:**
- `Similarity: 98.45%` → Alta probabilidad de ser la misma persona
- `Similarity: 75.20%` → Posible coincidencia, revisar manualmente
- `Similarity: < 70%` → No se reporta (debajo del umbral)

---

### Paso 8: Eliminar la Colección

**Código del notebook sin resolver:**
```python
print('Attempting to delete collection ' + collection_id)
try:
    response=client.delete_collection(CollectionId=collection_id)
    status_code=response['StatusCode']
    print('All done!')
    
except ClientError as e:
    if e.response['Error']['Code'] == 'ResourceNotFoundException':
        print ('The collection ' + collection_id + ' was not found ')
    else:
        print ('Error other than Not Found occurred: ' + e.response['Error']['Message'])
```

**Importancia:**
- **Evita cargos innecesarios** por almacenamiento
- Las colecciones persisten hasta ser eliminadas manualmente
- Buena práctica: eliminar recursos no utilizados

---

## Casos de Uso Reales

### 1. Control de Acceso
```python
# Verificar si una persona tiene acceso
response = client.search_faces_by_image(
    CollectionId='empleados',
    Image={'Bytes': imagen_camara},
    FaceMatchThreshold=95  # Umbral alto para seguridad
)

if response['FaceMatches']:
    print("Acceso concedido")
else:
    print("Acceso denegado")
```

### 2. Detección de Personas Desaparecidas
```python
# Buscar en base de datos de personas desaparecidas
for imagen in imagenes_nuevas:
    response = client.search_faces_by_image(
        CollectionId='personas_desaparecidas',
        Image={'Bytes': imagen},
        FaceMatchThreshold=80
    )
    if response['FaceMatches']:
        enviar_alerta(response['FaceMatches'])
```

### 3. Organización de Fotos
```python
# Agrupar fotos por persona
for foto in album_familiar:
    response = client.search_faces_by_image(
        CollectionId='familia',
        Image={'Bytes': foto}
    )
    persona = response['FaceMatches'][0]['Face']['ExternalImageId']
    organizar_en_carpeta(foto, persona)
```

---

## Mejores Prácticas

### 1. Calidad de Imagen
- Usar imágenes con **buena iluminación**
- Rostros **de frente** dan mejores resultados
- Resolución mínima recomendada: **80x80 píxeles** por rostro

### 2. Umbral de Similitud
| Caso de Uso | Umbral Recomendado |
|-------------|-------------------|
| Seguridad alta | 95-99% |
| Verificación general | 80-90% |
| Sugerencias | 70-80% |

### 3. Manejo de Errores
```python
from botocore.exceptions import ClientError

try:
    response = client.search_faces_by_image(...)
except ClientError as e:
    error_code = e.response['Error']['Code']
    if error_code == 'InvalidParameterException':
        print("No se detectó ningún rostro en la imagen")
    elif error_code == 'ImageTooLargeException':
        print("Imagen muy grande, redimensionar")
    else:
        raise
```

### 4. Costos
- **Indexación**: $0.001 por imagen
- **Búsqueda**: $0.001 por imagen
- **Almacenamiento**: $0.00001 por rostro/mes
- Eliminar colecciones no utilizadas

---

## Preguntas Frecuentes

### ¿Cuántos rostros puedo almacenar en una colección?
Hasta **20 millones** de rostros por colección.

### ¿Se pueden comparar rostros sin crear una colección?
Sí, usando `compare_faces()`:
```python
response = client.compare_faces(
    SourceImage={'Bytes': imagen1},
    TargetImage={'Bytes': imagen2}
)
```

### ¿Qué pasa si la imagen tiene múltiples rostros?
- `index_faces()` puede indexar múltiples rostros (configurable con `MaxFaces`)
- `search_faces_by_image()` usa el rostro más grande de la imagen

### ¿Rekognition almacena mis imágenes?
**No.** Solo almacena vectores de características (embeddings). Las imágenes originales no se guardan en AWS.

---

## Recursos Adicionales

- [Documentación oficial de Amazon Rekognition](https://docs.aws.amazon.com/rekognition/)
- [Precios de Amazon Rekognition](https://aws.amazon.com/rekognition/pricing/)
- [Boto3 Rekognition Reference](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/rekognition.html)

---

## Conclusión

Este laboratorio proporciona una base sólida para trabajar con reconocimiento facial usando AWS. Los conceptos aprendidos son aplicables a múltiples escenarios del mundo real, desde sistemas de seguridad hasta aplicaciones de organización de fotos.

**Conceptos clave aprendidos:**
- Creación y gestión de colecciones
- Indexación de rostros con `index_faces`
- Búsqueda de coincidencias con `search_faces_by_image`
- Visualización de resultados con BoundingBox
- Buenas prácticas de manejo de recursos en la nube
