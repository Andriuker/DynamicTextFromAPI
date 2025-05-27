**Leer en otros idiomas:** [English](README.md)

# DynamicTextFromAPI - Plugin de Stream Deck

**Autor:** Andriuker  
**Versión:** 0.10.0

Un plugin para Elgato Stream Deck que te permite configurar y ejecutar peticiones HTTP (GET, POST, PUT, DELETE, PATCH) y mostrar datos dinámicos extraídos de la respuesta JSON directamente en el título de una tecla.

![Screenshot](com.andriuker.dynamictextfromapi.sdPlugin/imgs/example.png)

## Características Principales

* **Peticiones HTTP Flexibles:** Realiza llamadas a APIs usando los métodos GET, POST, PUT, DELETE y PATCH.
* **Configuración Completa:** Define la URL del endpoint, las Cabeceras (Headers, en formato JSON) y el Cuerpo (Body, JSON o texto plano) de tu petición.
* **Extracción de Datos:** Usa "dot notation" (ej: `data.usuario.nombre`, `items[0].valor`) para extraer fácilmente el dato específico que necesitas de la respuesta JSON usando sintaxis [JSONPath-Plus](https://goessner.net/articles/JsonPath/).
* **Título Dinámico:** Muestra el dato extraído directamente como título de la tecla del Stream Deck.
* **Actualización Automática:** Configura un intervalo (en segundos) para que la petición se repita automáticamente y el título se mantenga actualizado. `0` para ejecución manual únicamente (al presionar la tecla).
* **Efecto Marquesina (Scroll):** Si el texto extraído es muy largo, activa la opción "Marquee" para mostrarlo con una animación de desplazamiento horizontal.
* **Feedback Visual (Opcional):** Habilita o deshabilita un checkmark verde (`✓`) temporal al presionar la tecla manualmente.
* **Word Wrap (Experimental):** Intenta dividir títulos largos en múltiples líneas (insertando `\n`) cuando el efecto Marquesina está desactivado. *Nota: La efectividad depende de las capacidades de renderizado de Stream Deck.*
* **Copiar al Portapapeles:** Mantén presionada la tecla (~750ms) para copiar el texto actual del título directamente a tu portapapeles.

## Instalación

1.  Descarga la última versión del plugin desde la sección de [**Releases**](https://github.com/Andriuker/DynamicTextFromAPI/releases) en GitHub. Necesitarás el archivo con extensión `.streamDeckPlugin`.
2.  Haz doble clic sobre el archivo descargado (`com.andriuker.dynamictextfromapi.streamDeckPlugin`).
3.  El software de Stream Deck te preguntará si deseas instalar el plugin. Confirma la instalación.

## Uso y Configuración

Una vez instalado, encontrarás una nueva acción llamada **"HTTP Caller"** en la lista de acciones del software Stream Deck, dentro de la categoría **"Dynamic Text From API"**.

1.  Arrastra la acción "HTTP Caller" a una tecla vacía en tu Stream Deck.
2.  Selecciona la tecla para ver el Panel de Propiedades (Property Inspector) y configura la petición:

    ![Property Inspector Screenshot](com.andriuker.dynamictextfromapi.sdPlugin/imgs/pi_screenshot.png) * **HTTP Method:** Selecciona el método HTTP para tu petición (GET, POST, PUT, DELETE, PATCH).
    * **URL:** Introduce la URL completa del endpoint de la API a la que quieres llamar. Asegúrate de que sea válida (ej: `https://api.example.com/data`).
    * **Headers (JSON):** Introduce las cabeceras HTTP necesarias en formato JSON válido. Cada par clave-valor representa una cabecera. Ejemplo:
        ```json
        {
          "Content-Type": "application/json",
          "Authorization": "Bearer TU_TOKEN_SECRETO",
          "X-Custom-Header": "Valor"
        }
        ```
        Si no necesitas cabeceras, déjalo vacío. Un JSON inválido mostrará "Header Err" en la tecla.
    * **Body (JSON/Text):** Introduce el cuerpo de la petición, necesario para métodos como POST, PUT, PATCH.
        * Si la cabecera `Content-Type` es `application/json`, asegúrate de que el cuerpo sea un JSON válido. Un JSON inválido mostrará "Body Err".
        * Para otros `Content-Type`, el cuerpo se tratará como texto plano.
        * Déjalo vacío para GET/DELETE o si no se requiere cuerpo.
    * **Response Path (Dot Notation):** Especifica la ruta para extraer el dato deseado de la respuesta. Usa la notación de puntos para JSON o XPath para XML.
	* Si el valor es un objeto o array, se mostrará como un string JSON (ej: `{"id":1,...}` o `[1,2,3]`).
	* Si lo dejas vacío, el plugin intentará mostrar la respuesta completa.
    * **Update Interval (seconds):** El número de segundos entre cada ejecución automática de la petición. `0` deshabilita la actualización automática; la petición solo se ejecutará al presionar la tecla. Un intervalo mínimo recomendado suele ser 5-10 segundos para evitar límites de tasa (rate limiting).
    * **Enable Marquee for long text:** Marca esta casilla si quieres que los textos que excedan aproximadamente 10 caracteres se muestren con una animación de desplazamiento horizontal (marquesina).
    * **Show 'OK' on Press:** Marca esta casilla para ver una confirmación visual rápida (checkmark verde `✓`) en la tecla cada vez que la presiones manualmente.
    * **Botón "Probar Petición":** Debajo de las opciones de configuración en el Inspector de Propiedades, encontrarás un botón "Probar Petición".
        * Al hacer clic en este botón, se ejecutará inmediatamente la petición HTTP utilizando la configuración actual ingresada en los campos anteriores (URL, Método, Cabeceras, Cuerpo, Ruta de Respuesta).
        * El resultado de esta petición de prueba (ya sea los datos extraídos, un mensaje de éxito o un mensaje de error) se mostrará en un cuadro de "Resultado de la Prueba" directamente debajo del botón.
        * Esto te permite verificar rápidamente tu configuración y ver qué datos intentará obtener y mostrar el plugin sin necesidad de activar la acción en la tecla del Stream Deck o esperar un intervalo de actualización.
        * Es particularmente útil para depurar tu ruta de respuesta o asegurar que tus cabeceras y cuerpo estén correctamente formateados.

## Ejemplos Prácticos

**1. Mostrar IP Pública:**

* **Method:** `GET`
* **URL:** `https://api.ipify.org?format=json`
* **Headers:** (Vacío)
* **Body:** (Vacío)
* **Response Path:** `ip`
* **Update Interval:** `600` (Se actualiza cada 10 minutos)
* **Resultado:** La tecla mostrará tu dirección IP pública actual.

**2. Analizar Respuesta XML (w3schools API):**

* **Method:** `GET`
* **URL:** `https://www.w3schools.com/xml/note.xml`
* **Headers:** (Vacío)
* **Body:** (Vacío)
* **Response Path:** `//note/to`
* **Update Interval:** `0`
* **Resultado:** La tecla mostrará el valor del elemento `<to>` en la respuesta XML (ej., "Tove").

**3. Extraer Datos de Texto Plano:**

* **Method:** `GET`
* **URL:** `https://api.ipify.org/?format=plaintext`
* **Headers:** (Vacío)
* **Body:** (Vacío)
* **Response Path:** `/\\d+/g`
* **Update Interval:** `0`
* **Resultado:** La tecla mostrará todos los números encontrados en la respuesta (ej., "190217222135").

**4. Enviar un POST simple (httpbin.org):**

* **Method:** `POST`
* **URL:** `https://httpbin.org/post`
* **Headers:** `{"Content-Type": "application/json"}`
* **Body:** `{"miDato": 123, "activo": true}`
* **Response Path:** `json.miDato` (httpbin devuelve el JSON enviado dentro de una clave `json`)
* **Update Interval:** `0`
* **Resultado:** La tecla debería mostrar `123` después de presionar.

### Copiar Título al Portapapeles

Si necesitas copiar rápidamente el valor que se muestra en la tecla (por ejemplo, una IP, un ID, un nombre, etc.), simplemente **mantén presionada la tecla** en tu Stream Deck durante aproximadamente 3/4 de segundo (750ms). El texto actual del título se copiará automáticamente a tu portapapeles.

## Notas y Limitaciones

* **Manejo de Errores:** El plugin muestra errores básicos en el título (`Req Error`, `Timeout`, `Net Error`, `Err [Código]`, `Header Err`, `Body Err`). Para detalles específicos, revisa los logs del plugin (habilita el modo debug en Stream Deck si es necesario: `streamdeck dev` vía CLI).
* **Validación JSON:** Asegúrate de que el JSON introducido en Headers y Body (cuando aplique) sea estrictamente válido. Puedes usar validadores online para verificarlo.
* **Regex en Texto Plano:** Para respuestas en texto plano, puedes usar un patrón regex en el campo `Response Path` para extraer datos específicos.
* **Seguridad:** Evita introducir tokens de API muy sensibles directamente en el campo Headers si el perfil de Stream Deck pudiera ser compartido. Considera las implicaciones de seguridad al manejar APIs. Este plugin realiza peticiones de red externas según la configuración del usuario.

## Soporte

Si encuentras algún problema, tienes sugerencias o quieres contribuir, por favor abre un [**Issue**](https://github.com/Andriuker/DynamicTextFromAPI/issues) en el repositorio de GitHub.

## Licencia

[MIT License](LICENSE.txt)

**Descargo de responsabilidad:** Este plugin no está afiliado ni respaldado por Elgato. Stream Deck es una marca registrada de Elgato.

---

## TO DO / Tareas Pendientes

### Manejo de Datos y Formato
- [x] Añadir soporte para más formatos de respuesta (XML vía XPath, Texto Plano vía Regex/delimitadores).  
  *Se ha implementado soporte para respuestas XML usando XPath y análisis de texto plano mediante Regex.*

- [ ] Implementar opciones de formateo de datos (números, fechas, prefijo/sufijo, límite de longitud).
- [ ] Mejorar la visualización de tipos objeto/array (mostrar `{...}` o `[...]` en lugar de `[Object]`).
- [ ] Permitir definir múltiples rutas de respuesta (ej., para visualización multilínea o separación título/imagen).

### Mejoras de Interfaz de Usuario (Inspector de Propiedades)
- [ ] Crear un editor clave-valor amigable para las cabeceras (reemplazar textarea JSON).
- [ ] Añadir campos dedicados para tokens de autorización comunes (Bearer, API Key).
- [ ] Implementar validación de entradas en tiempo real (formato URL, validez JSON para cabeceras/cuerpo).
- [x] Añadir un botón "Probar Petición" en el Inspector de Propiedades para feedback inmediato.
- [ ] Implementar perfiles/presets para guardar y cargar configuraciones comunes de peticiones.

### Mejoras Visuales y de Feedback
- [ ] Implementar imágenes dinámicas en teclas usando `setImage` basadas en un valor de la respuesta (URL de imagen o estado).
- [ ] Añadir iconos de estado (ej., verde/rojo) basados en el código de respuesta o comparación de valor numérico.
- [ ] Permitir la personalización de las acciones de feedback (OK, Alerta, ninguno, icono personalizado).
- [ ] Adaptar la interfaz y funcionalidad para Stream Deck + (diales, pantalla táctil).

### Lógica de Petición Avanzada
- [ ] Implementar soporte para variables/plantillas en URL, Cabeceras, Cuerpo (desde ajustes globales, estado de otras acciones, entrada de usuario).
- [ ] Permitir a los usuarios configurar la duración del tiempo de espera (timeout) de la petición.
- [ ] Añadir una opción para reintentos automáticos en caso de fallo de la petición.
- [ ] Añadir configuración para el manejo de redirecciones HTTP (3xx).

### Calidad de Vida y Otros
- [ ] Investigar e implementar un mejor ajuste de texto (word wrapping) para la visualización en la tecla.
- [ ] Añadir funcionalidad para importar/exportar configuraciones de acciones.
- [ ] Traducir (localizar) la interfaz del Inspector de Propiedades a múltiples idiomas.