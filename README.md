# Coto Sorter — Precio por Unidad

Extensión de navegador (Chrome / Firefox 109+) que mejora [Coto Digital](https://www.cotodigital.com.ar) permitiendo ordenar productos por **precio real por unidad** ($/kg o $/L), ajustado por descuentos y promos.

## Problema que resuelve

El sitio de Coto muestra "Precio por 1 Kilogramo" o "Precio por 1 Litro", pero ese valor está calculado sobre el **precio regular** (sin descuento). Si un producto tiene 25%DTO, el precio por kilo en pantalla NO refleja lo que realmente pagás.

Esta extensión:
1. Calcula el **precio unitario real** aplicando el ratio de descuento
2. Muestra un **badge visual** en cada producto con el precio ajustado
3. Permite **ordenar** de menor a mayor por precio real/kg o precio real/L

## Instalación

### Chrome
1. Abrí `chrome://extensions/`
2. Activá **Modo desarrollador** (esquina superior derecha)
3. Click **Cargar descomprimida**
4. Seleccioná la carpeta `sorter-coto-precio/`

### Firefox
1. Abrí `about:debugging#/runtime/this-firefox`
2. Click **Cargar complemento temporal**
3. Seleccioná el archivo `manifest.json` dentro de `sorter-coto-precio/`

## Uso

1. Navegá a [Coto Digital](https://www.cotodigital.com.ar) y buscá productos
2. Aparece un **panel flotante** abajo a la derecha con tres botones:
   - **Ordenar $/Kg ↑** — Ordena por precio real por kilogramo (menor primero)
   - **Ordenar $/L ↑** — Ordena por precio real por litro (menor primero)
   - **Reset** — Restaura el orden original y quita los badges
3. Los **badges** verdes (con descuento) o grises (sin descuento) aparecen en cada card
4. El panel es **arrastrable** — hacé click en el encabezado y movelo
5. Podés **minimizarlo** con el botón −

## Modo Debug

1. Click en el ícono de la extensión (toolbar del navegador)
2. Activá **Modo Debug**
3. Abrí DevTools (F12) → Console
4. Verás logs con prefijo `[CotoSorter]` con datos de extracción y sorting

## Cómo funciona

### Fórmula de ajuste de precio

```
precioUnitarioReal = precioUnitarioListado × (precioMostrado / precioRegular)
```

Ejemplo: Harina Integral Pureza 1kg
- Precio mostrado (h4): $1.348,47 (lo que pagás con 25%DTO)
- Precio regular: $1.797,96
- Precio por 1 Kilogramo: $1.797,96
- **Precio real/kg = $1.797,96 × (1.348,47 / 1.797,96) = $1.348,47**

### Tipos de promo soportados

La fórmula funciona con **cualquier tipo de promo** porque el h4 siempre muestra el precio final:
- X% DTO (25%, 30%, 35%...)
- 2da unidad al X% DTO
- 2x1, 3x2, 6x5, etc.
- Cualquier descuento que el sitio aplique

### Variantes de unidad soportadas

- `Precio por 1 Kilo`
- `Precio por 1 Kilogramo`
- `Precio por 1 Kilogramo escurrido`
- `Precio por 1 Litro`

## Estructura del proyecto

```
sorter-coto-precio/
├── manifest.json       ← Manifest V3
├── content.js          ← Script inyectado en la página
├── styles.css          ← Estilos del panel y badges
├── popup/
│   ├── popup.html      ← Popup con toggle de debug
│   └── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── example.md          ← HTML de ejemplo para referencia
└── README.md
```

## Notas técnicas

- **Sin backend** — todo es manipulación de DOM del lado del cliente
- **Compatible con Angular** — usa `appendChild` para mover nodos sin destruir bindings
- **Anti-loop** — flag `isSorting` + `requestAnimationFrame` evitan loops con el MutationObserver
- **Debounce** — el observer agrupa mutaciones en ventanas de 400ms
- **Memory-safe** — el observer se desconecta en `unload`
- **Selector robusto** — usa `data-cnstrc-item-price` como fuente primaria del precio regular

## Licencia

MIT


HOW TO ZIP IT for firefox:

zip -r extension.zip manifest.json content.js styles.css icons/ popup/ -x "*.git*"