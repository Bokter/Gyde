# fixtures

Datos de ejemplo **sintéticos** para desarrollar, probar y hacer la demo **sin red**. Nada de aquí describe una vulnerabilidad, un paquete o un cliente reales: los paquetes `Acme.*`, los identificadores `SAMPLE-*` y `CVE-9999-*` son inventados. Son coherentes con `@gyde/contracts/samples`, así que un proyecto de ejemplo produce los mismos resultados que las muestras.

## Proyectos (los lee `@gyde/analysis-engine`)

| Carpeta | Qué es |
|---|---|
| `projects/unity-sample/` | Proyecto Unity 2022.3 con un paquete UPM y dos paquetes NuGet |
| `projects/unreal-sample/` | Proyecto Unreal 5.3 con plugins, módulos y una librería C++ de terceros |

**Resultado esperado del parseo de Unity:** `projects/unity-sample/expected-parse.json`. Reglas que ya cumple:

- Las dependencias salen **ordenadas** por ecosistema y nombre (resultado determinístico).
- Los módulos integrados del motor (`com.unity.modules.*`) **no** son paquetes externos: se omiten.
- La licencia de los paquetes NuGet se lee de su `.nuspec`; los paquetes UPM no declaran licencia en el manifiesto.
- `Assets/Scripts/Player.cs` contiene la marca `PROPRIETARY_MARKER_DO_NOT_SEND`: una prueba de privacidad debe comprobar que **ningún** rastro de ese archivo aparece en la solicitud que sale del cliente.

**Unreal (propuesta, el Área 4 la ajusta):** del `.uproject` se toman los plugins habilitados y la versión del motor (`EngineAssociation`); de `Build.cs`, los módulos que no son del propio proyecto; de `vcpkg.json`, las librerías C++ (`ecosystem: "cpp"`). Los plugins y módulos del motor llevan la versión del motor.

## Fuentes (las leen los adaptadores de `services/normalization`)

| Carpeta | Fuente | Contenido |
|---|---|---|
| `sources/osv/` | OSV | `SAMPLE-0001` afecta a `Acme.Serialization` < 1.5.0; `SAMPLE-0002` es de otro paquete; `SAMPLE-0003` afecta solo a 2.0.0–2.1.0 |
| `sources/ghsa/` | GitHub Advisories | El mismo aviso `SAMPLE-0001` en el formato de GHSA. Lleva `SAMPLE-0001` entre sus `identifiers` para que comparta alias con el aviso de OSV (ver «Alias y duplicados entre fuentes») |
| `sources/nvd/` | NVD (API 2.0) | Un CVE ficticio sobre una librería C++ (`acme:samplelib`) |
| `sources/official/` | Documentación del motor | Extracto de notas de versión de Unity |
| `sources/community/` | GitHub Issues | Dos issues de comunidad (confianza baja) |

### Alias y duplicados entre fuentes

- El objeto normalizado lista en `aliases` el identificador del propio aviso **y** sus equivalentes (`CVE-…`, `GHSA-…`). Dos objetos de fuentes distintas que comparten un alias describen el mismo aviso.
- No se deduplica al ingerir: `osv:SAMPLE-0001` y `ghsa:GHSA-0000-0000-0001` conviven en la base. Retrieval deduplica **solo** cuando los `aliases` se comparten, de modo que `Acme.Serialization` produce un único hallazgo. Por eso el fixture de GHSA incluye `SAMPLE-0001` como identificador.
- Los rangos de OSV se normalizan así: `introduced: "0"` significa «desde el inicio» y se conserva tal cual; cada par `introduced` → `fixed`/`last_affected` es un rango; una lista `versions` es otra forma, independiente, de estar afectado.
- **Nombre de los paquetes C++ del NVD:** el `name` es **solo el producto** del CPE (`cpe:2.3:a:acme:samplelib:…` → `samplelib`), sin el fabricante, para que coincida con el nombre de vcpkg del proyecto.

## Resultado esperado del análisis de `unity-sample`

| Hallazgo | Por qué |
|---|---|
| `Acme.Serialization 1.4.0` afectado por `SAMPLE-0001` (alta, CVSS 7.5) | 1.4.0 está dentro de [0, 1.5.0) |
| `Acme.GplToolkit` con licencia `GPL-3.0-only` (media) | *Copyleft* fuerte frente a distribución propietaria |
| **Sin** hallazgo por `SAMPLE-0002` ni `SAMPLE-0003` | Otro paquete, y 1.4.0 queda fuera de 2.0.0–2.1.0: sirven para probar que no hay falsos positivos |

## Reglas

- Mantén los fixtures **pequeños** y legibles: son documentación viva.
- Si añades uno, explica en esta tabla para qué sirve y qué resultado se espera.
- No metas datos reales de clientes ni de avisos de seguridad copiados tal cual.
