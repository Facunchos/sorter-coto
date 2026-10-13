# Coto Sorter — Precio por Unidad

Extensión de navegador que mejora [Coto Digital](https://www.cotodigital.com.ar) permitiendo **ordenar productos por precio real por unidad** ($/kg, $/L, $/100g, $/m², $/u), ajustado por descuentos y promos.

---

## Privacidad y seguridad

- **No se conecta a internet** — toda la lógica corre localmente en tu navegador.
- **No lee datos personales** — solo procesa información de productos visible en la página.
- **No recolecta ni envía datos** — cero tracking, cero analytics, cero telemetría.
- **Código abierto** — podés leer, auditar y modificar todo el código fuente.
- **Sin servidor externo** — no hay backend, no hay APIs propias, nada sale de tu máquina.

---

## Qué hace

El sitio de Coto muestra el "Precio por 1 Kilogramo" o "Precio por 1 Litro", pero ese valor se calcula sobre el **precio regular** (sin descuento). Si un producto tiene 25% DTO, el precio por kilo en pantalla **no refleja lo que realmente pagás**.

Esta extensión:

1. **Calcula el precio unitario real** aplicando el ratio de descuento
2. **Muestra un badge visual** en cada producto con el precio ajustado
3. **Ordena de menor a mayor** por precio real por kg, litro, 100g, m² o unidad
4. **Genera revista de promos** — versión imprimible (guardar como PDF) o vista HTML con todos los productos de la categoría

## Instalación

### Chrome / Edge / Brave
1. Abrí `chrome://extensions/`
2. Activá **Modo desarrollador**
3. Click **Cargar descomprimida** → seleccioná la carpeta del proyecto

### Firefox
1. Abrí `about:debugging#/runtime/this-firefox`
2. Click **Cargar complemento temporal** → seleccioná `manifest.json`

## Uso

1. Navegá a [Coto Digital](https://www.cotodigital.com.ar) y buscá productos
2. Aparece un **panel flotante** (arrastrable y minimizable) con:
   - **Ordenar** — elegí criterio: $/Kg, $/L, $/100g, $/m², $/Unidad
   - **Generar** — "Revista (Imprimible/PDF)" o vista HTML ligera
   - **Reset** — restaurá el orden original
3. Los **badges** aparecen en cada card: verdes (con descuento) o grises (sin descuento)

## Modo Debug

1. Click en el ícono de la extensión → activá **Modo Debug**
2. Abrí DevTools (F12) → Console
3. Vas a ver logs con prefijo `[CotoSorter]`

## Estructura del proyecto

```
sorter-coto-precio/
├── manifest.json          ← Manifest V3
├── content.js             ← Entry point, MutationObserver
├── styles.css             ← Estilos del panel y badges
├── src/
│   ├── utils.js           ← Constantes, parsers, normalizadores
│   ├── logger.js          ← Debug logging
│   ├── badges.js          ← Extracción de precios e inyección de badges
│   ├── sorter.js          ← Ordenamiento de productos
│   ├── api.js             ← Captura de URL Endeca y scraping JSON
│   ├── revista.js         ← Flujo de revista imprimible y HTML
│   ├── vistaLigera.js     ← Generación de vista HTML
│   └── ui.js              ← Panel flotante y controles
├── popup/
│   ├── popup.html         ← Popup con toggle de debug
│   └── popup.js
└── icons/
```

## Cómo funciona el ajuste de precio

```
precioUnitarioReal = precioUnitarioListado × (precioMostrado / precioRegular)
```

Funciona con **cualquier tipo de promo**: X% DTO, 2da unidad al X%, 2x1, 3x2, etc.

## Notas técnicas

- **100% local** — manipulación de DOM del lado del cliente
- **Compatible con Angular** — usa `appendChild` para mover nodos sin destruir bindings
- **Anti-loop** — flag `isSorting` + `requestAnimationFrame` evitan loops con el MutationObserver
- **Debounce** — el observer agrupa mutaciones en ventanas de 400ms

## Empaquetar para subir a las tiendas

Desde la raíz del proyecto, en **PowerShell** (no requiere crear carpeta temporal):

```powershell
$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
New-Item -ItemType Directory -Path dist -Force | Out-Null
$files = @(Get-Item manifest.json, content.js, bg.js, styles.css) +
  (Get-ChildItem src, popup, icons -Recurse -File) |
  Where-Object { $_.FullName -notmatch '\\dist\\' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-Package([string]$zipPath, [string]$manifestJson) {
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  $zipAbs = Join-Path (Get-Location).Path $zipPath
  $zip = [System.IO.Compression.ZipFile]::Open($zipAbs, 'Create')
  try {
    foreach ($f in $files) {
      if ($f.Name -eq 'manifest.json') {
        $entry = [System.IO.Compression.ZipFileExtensions]::CreateEntry($zip, 'manifest.json')
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($manifestJson)
        $stream = $entry.Open()
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        continue
      }
      $entry = $f.FullName.Substring((Get-Location).Path.Length + 1).Replace('\', '/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entry, 'Optimal') | Out-Null
    }
  } finally { $zip.Dispose() }
}

$manifest = Get-Content manifest.json -Raw
# Chrome: background.service_worker (como está en manifest.json)
New-Package "dist\sorter-coto-v$version-chrome.zip" $manifest
# Firefox: exige background.scripts como fallback (AMO lint: BACKGROUND_SERVICE_WORKER_NOFALLBACK);
# Firefox usa scripts (event page) e ignora service_worker
$manifestFF = $manifest -replace '"service_worker"\s*:\s*"bg\.js"', '"service_worker": "bg.js", "scripts": ["bg.js"]'
New-Package "dist\sorter-coto-v$version-firefox.zip" $manifestFF
```

Produce `dist\sorter-coto-v<versión>-chrome.zip` (**Chrome Web Store**) y
`dist\sorter-coto-v<versión>-firefox.zip` (**Firefox AMO**). Los ZIP se diferencian solo en el
manifest: Chrome exige `background.service_worker` y **rechaza** `background.scripts`
(`'background.scripts' requires manifest version of 2 or lower`), mientras que AMO **exige** que
`service_worker` venga acompañado de `scripts` como fallback
(`BACKGROUND_SERVICE_WORKER_NOFALLBACK`) — Firefox ejecuta `scripts` (event page) e ignora
`service_worker`. Validar el ZIP de Firefox con `npx web-ext lint --source-dir .`.

> Importante: no uses `Compress-Archive` para Firefox — genera rutas con `\` y AMO las rechaza (`Invalid file name in archive`). El script de arriba fuerza `/` en cada entrada.

## Licencia

Código abierto. Usalo, modificalo, compartilo.
