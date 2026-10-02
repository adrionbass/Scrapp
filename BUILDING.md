# Compilación

**Español** | [English](BUILDING.en.md)

## Requisitos

- Windows 10 u 11.
- Node.js 20 o posterior.
- npm.
- Conexión a Internet durante la primera compilación del runtime de Windows.

La exportación de APK requiere además un JDK y Android SDK con Build Tools 35.0.0 o posterior.

La primera exportación de APK genera una identidad de firma local en `%USERPROFILE%\.scrapp`. Conservá una copia de esa carpeta si necesitás publicar futuras actualizaciones de los mismos APK.

## Preparación

```powershell
npm install
npm test
```

## Ejecutable de Scrapp

```powershell
npm run build:exporter
```

El resultado queda en `outputs/Scrapp.exe`. La carpeta `outputs` y los archivos temporales de `work` no forman parte del código fuente.
