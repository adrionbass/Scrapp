# Arquitectura

**Español** | [English](ARCHITECTURE.en.md)

Scrapp utiliza Electron para la interfaz de escritorio y TurboWarp Packager para ejecutar y empaquetar proyectos de Scratch.

## Directorios

- `desktop/`: interfaz, proceso principal y exportadores Windows/Android.
- `src/`: validación de proyectos y preparación del runtime Windows usado para compilar Scrapp.
- `tools/`: script de compilación y fuentes del lanzador autocontenido.
- `tests/`: pruebas automatizadas y fixtures mínimos.

## Flujo de exportación

1. Se carga un archivo `.sb3` o se descarga un proyecto público de Scratch.
2. TurboWarp prepara el proyecto y su runtime.
3. El exportador genera el destino seleccionado.
4. Windows produce un único `.exe`; Android produce un `.apk` firmado.

## Modos

- `test`: Modo Control, con ejecución, pausa, detención, volumen y turbo.
- `final`: Modo Final, con inicio automático y control de volumen.

Los archivos temporales se crean fuera del código fuente y se eliminan al finalizar cada operación.
