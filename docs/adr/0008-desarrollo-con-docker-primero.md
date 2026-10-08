# 0008. Desarrollo con Docker primero

- **Estado:** Aceptada
- **Fecha:** 2026-10-08

## Contexto

- El repositorio de al menos una persona vive dentro de **OneDrive**. Un `node_modules` tiene decenas de miles de archivos: OneDrive se vuelve lento y a veces bloquea archivos; con pnpm (enlaces simbólicos) puede fallar la instalación.
- Hay poco espacio libre en el disco del sistema en algunas máquinas, y las dependencias más las imágenes de Docker pesan varios GB.
- En Windows, **Node y pnpm pueden fallar con rutas muy largas** (límite clásico de 260 caracteres): lo comprobamos al verificar este repositorio desde una carpeta con una ruta profunda.

## Decisión

El flujo normal de desarrollo es **dentro de contenedores**: las dependencias viven en la imagen, no en la carpeta del repositorio.

- `docker compose` levanta PostgreSQL y los servicios; **`docker compose watch`** sincroniza los cambios de código dentro de los contenedores (sin montar la carpeta del repositorio, de modo que `node_modules` nunca aparece en el host).
- Las comprobaciones (`lint`, `typecheck`, `test`, `build`) se ejecutan en un contenedor y en el CI.
- Quien quiera instalar en el host (por ejemplo, para el autocompletado del editor) puede hacerlo con una **ruta corta** (por ejemplo `C:\dev\Gyde`); los *hooks* de git son tolerantes: si no hay dependencias instaladas, avisan y no bloquean, y el CI valida igualmente el título del PR.
- Cada servicio tiene su propio `Dockerfile` (despliegue independiente, como pide el documento).

## Consecuencias

- Entorno reproducible: "funciona en mi máquina" pesa menos.
- Se necesita Docker Desktop (y espacio para su disco; se recomienda moverlo a un disco con holgura).
- El ciclo editar-probar tiene un paso más que ejecutar directamente en el host.

## Alternativas descartadas

- **Instalar todo en el host:** simple, pero choca con OneDrive y el espacio de disco, y reintroduce diferencias entre máquinas.
- **Volúmenes nombrados por cada `node_modules` de cada paquete:** funcionan, pero se rompen cada vez que alguien añade un paquete.
