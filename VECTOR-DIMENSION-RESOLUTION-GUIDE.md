# 🔧 Vector Dimension Resolution Guide

## 📋 Diagnóstico del Problema

### Error Detectado
```
Embedding compatibility error: Vector size mismatch: collection expects 1024, but embedding service produces 768
```

### Estado Actual del Sistema
- **Colección afectada:** `roo_memory` 
- **Dimensiones esperadas:** 1024
- **Servicio en uso:** Probablemente Ollama (768 dimensiones)
- **Causa:** Mismatch entre colección existente y servicio de embeddings

### Análisis Técnico

#### Dimensiones por Servicio de Embeddings
| Servicio | Dimensiones | Modelo por Defecto |
|----------|-------------|-------------------|
| OpenAI | 1536 | text-embedding-ada-002 |
| OpenRouter | 1536 | openai/text-embedding-ada-002 |
| Ollama | 768 | nomic-embed-text |
| FastEmbed | 384 | BAAI/bge-small-en |

#### Estado de Colecciones
```bash
# Verificación realizada
curl http://host.docker.internal:6333/collections/roo_memory
# Resultado: 1024 dimensiones (no coincide con ningún servicio estándar)
```

## 🛠️ Soluciones Disponibles

### Opción 1: Recrear Colección (RECOMENDADO)
**Ventajas:** Compatibilidad completa, uso del servicio preferido
**Desventajas:** Pérdida de datos existentes

### Opción 2: Cambiar Servicio de Embeddings
**Ventajas:** Mantiene datos existentes
**Desventajas:** Ningún servicio produce exactamente 1024 dimensiones

### Opción 3: Crear Nueva Colección
**Ventajas:** Mantiene datos históricos
**Desventajas:** Fragmentación de datos

## 🚀 Implementación de Soluciones

### SOLUCIÓN 1: Recrear Colección roo_memory (RECOMENDADO)

#### Paso 1: Backup de Datos (Opcional)
```bash
# Crear directorio de backup
mkdir -p /app/.ruru/mcp-servers/better-qdrant-mcp-server/backups

# Exportar datos existentes (si es necesario preservarlos)
curl -X POST http://host.docker.internal:6333/collections/roo_memory/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 1000}' > backups/roo_memory_backup.json
```

#### Paso 2: Eliminar Colección Existente
```bash
# Usando herramientas MCP
cd /app/.ruru/mcp-servers/better-qdrant-mcp-server
```

**Comando MCP:**
```typescript
// En la terminal MCP o mediante herramienta
f1e_delete_collection("roo_memory")
```

**O usando curl directo:**
```bash
curl -X DELETE http://host.docker.internal:6333/collections/roo_memory
```

#### Paso 3: Crear Nueva Colección Compatible
```typescript
// Automático al agregar documentos con el servicio correcto
// El sistema creará automáticamente la colección con las dimensiones correctas
```

### SOLUCIÓN 2: Migración Completa de Servicios

#### Script de Migración Automática
```bash
#!/bin/bash
# /app/.ruru/mcp-servers/better-qdrant-mcp-server/scripts/migrate-collections.sh

QDRANT_URL="http://host.docker.internal:6333"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

echo "🔄 Iniciando migración de colecciones..."

# Crear directorio de backup
mkdir -p "$BACKUP_DIR"

# Listar todas las colecciones
COLLECTIONS=$(curl -s "$QDRANT_URL/collections" | grep -o '"[^"]*"' | tr -d '"' | grep -v result)

for collection in $COLLECTIONS; do
    echo "📦 Procesando colección: $collection"
    
    # Obtener información de la colección
    INFO=$(curl -s "$QDRANT_URL/collections/$collection")
    VECTOR_SIZE=$(echo "$INFO" | grep -o '"size":[0-9]*' | cut -d: -f2)
    
    echo "  📏 Dimensiones actuales: $VECTOR_SIZE"
    
    # Backup de datos
    echo "  💾 Creando backup..."
    curl -X POST "$QDRANT_URL/collections/$collection/points/scroll" \
         -H "Content-Type: application/json" \
         -d '{"limit": 10000}' > "$BACKUP_DIR/${collection}_backup.json"
    
    # Verificar si necesita migración
    if [ "$VECTOR_SIZE" != "768" ]; then
        echo "  🔄 Requiere migración de $VECTOR_SIZE a 768 dimensiones"
        echo "  ⚠️  ATENCIÓN: Eliminando colección existente..."
        
        # Eliminar colección
        curl -X DELETE "$QDRANT_URL/collections/$collection"
        
        echo "  ✅ Colección eliminada. Se recreará automáticamente al agregar documentos."
    else
        echo "  ✅ Colección ya compatible"
    fi
done

echo "🎉 Migración completada. Backups en: $BACKUP_DIR"
```

## 🔧 Mejoras al Sistema de Validación

### Actualización del VectorValidationService

#### Método de Auto-Resolución
```typescript
// /app/.ruru/mcp-servers/better-qdrant-mcp-server/src/services/validation.ts

export class VectorValidationService {
  // ... código existente ...

  /**
   * Método para auto-resolver conflictos de dimensiones
   */
  async autoResolveVectorMismatch(
    collection: string,
    embeddingService: EmbeddingService,
    options: {
      autoRecreate?: boolean;
      backupFirst?: boolean;
      confirmCallback?: () => Promise<boolean>;
    } = {}
  ): Promise<{ resolved: boolean; action: string; backup?: string }> {
    
    const validation = await this.validateVectorCompatibility(collection, embeddingService);
    
    if (validation.compatible) {
      return { resolved: true, action: 'no_action_needed' };
    }

    // Crear backup si se solicita
    let backupPath: string | undefined;
    if (options.backupFirst) {
      backupPath = await this.createCollectionBackup(collection);
    }

    // Confirmar acción si hay callback
    if (options.confirmCallback) {
      const confirmed = await options.confirmCallback();
      if (!confirmed) {
        return { resolved: false, action: 'user_cancelled' };
      }
    }

    // Auto-recrear si está habilitado
    if (options.autoRecreate) {
      await this.qdrantService.deleteCollection(collection);
      return { 
        resolved: true, 
        action: 'collection_recreated', 
        backup: backupPath 
      };
    }

    return { resolved: false, action: 'manual_intervention_required' };
  }

  /**
   * Crear backup de una colección
   */
  private async createCollectionBackup(collection: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = './backups';
    const backupFile = `${backupDir}/${collection}_${timestamp}.json`;
    
    // Crear directorio si no existe
    await fs.promises.mkdir(backupDir, { recursive: true });
    
    // Scroll através de todos los puntos
    const points = await this.qdrantService.scrollPoints(collection, { limit: 10000 });
    
    // Guardar backup
    await fs.promises.writeFile(backupFile, JSON.stringify(points, null, 2));
    
    return backupFile;
  }

  /**
   * Sugerencias inteligentes basadas en el problema específico
   */
  getIntelligentSuggestions(
    collectionDimensions: number, 
    serviceDimensions: number
  ): Array<{ action: string; description: string; risk: 'low' | 'medium' | 'high' }> {
    
    const suggestions = [];

    // Buscar servicios compatibles
    const compatibleServices = this.getCompatibleServices(collectionDimensions);
    
    if (compatibleServices.length > 0) {
      suggestions.push({
        action: `switch_to_${compatibleServices[0]}`,
        description: `Cambiar a ${compatibleServices[0]} (${collectionDimensions}D)`,
        risk: 'low'
      });
    }

    // Recrear colección
    suggestions.push({
      action: 'recreate_collection',
      description: `Recrear colección con ${serviceDimensions} dimensiones`,
      risk: 'high'
    });

    // Crear nueva colección
    suggestions.push({
      action: 'create_new_collection',
      description: `Crear nueva colección '${collection}_v2' con ${serviceDimensions}D`,
      risk: 'low'
    });

    return suggestions;
  }

  private getCompatibleServices(dimensions: number): string[] {
    const serviceMap: Record<number, string[]> = {
      384: ['fastembed'],
      768: ['ollama'],
      1536: ['openai', 'openrouter']
    };
    
    return serviceMap[dimensions] || [];
  }
}
```

### Integración en Main Server

```typescript
// /app/.ruru/mcp-servers/better-qdrant-mcp-server/src/index.ts

class BetterQdrantMCPServer extends Server {
  // ... código existente ...

  private async handleAddDocuments(request: any): Promise<any> {
    try {
      const { filePath, collection, embeddingService, chunkSize, chunkOverlap } = request.params;

      // Validación mejorada con auto-resolución
      const validation = await this.validationService.validateVectorCompatibility(
        collection, 
        embeddingService
      );

      if (!validation.compatible) {
        // Ofrecer resolución automática
        const suggestions = this.validationService.getIntelligentSuggestions(
          validation.collectionDimensions!,
          validation.serviceDimensions!
        );

        // Intentar resolución automática para casos seguros
        if (suggestions[0]?.risk === 'low') {
          const resolution = await this.validationService.autoResolveVectorMismatch(
            collection,
            embeddingService,
            { autoRecreate: false, backupFirst: true }
          );

          if (resolution.resolved) {
            // Continuar con el procesamiento
          } else {
            throw new Error(`
Embedding compatibility error: ${validation.error}

Auto-resolution options:
${suggestions.map(s => `- ${s.description} (Risk: ${s.risk})`).join('\n')}

To resolve automatically, run:
  f1e_delete_collection("${collection}")

Then retry the operation.
            `);
          }
        } else {
          throw new Error(`
Embedding compatibility error: ${validation.error}

Suggested actions:
${suggestions.map(s => `- ${s.description} (Risk: ${s.risk})`).join('\n')}

For automatic resolution:
  f1e_delete_collection("${collection}")
          `);
        }
      }

      // Procesar documentos normalmente...
      const result = await this.processDocuments(filePath, collection, embeddingService, chunkSize, chunkOverlap);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, ...result }, null, 2)
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: "text", 
          text: JSON.stringify({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          }, null, 2)
        }]
      };
    }
  }
}
```

## 🎯 Resolución Inmediata para tu Problema

### Comando Rápido
```typescript
// Opción 1: Eliminar y recrear automáticamente
f1e_delete_collection("roo_memory")

// Luego reintenta tu operación original
// La colección se recreará automáticamente con las dimensiones correctas
```

### Verificación Post-Resolución
```bash
# Verificar que la colección fue eliminada
curl http://host.docker.internal:6333/collections/roo_memory
# Debería devolver 404

# Después de agregar documentos, verificar nueva colección
curl http://host.docker.internal:6333/collections/roo_memory
# Debería mostrar 768 dimensiones (para Ollama)
```

## 📚 Prevención de Futuros Problemas

### 1. Configuración de Servicio por Defecto
```json
// package.json o .env
{
  "defaultEmbeddingService": "ollama",
  "enforceServiceConsistency": true,
  "autoBackupBeforeRecreate": true
}
```

### 2. Hooks de Validación
```typescript
// Pre-operation validation hooks
beforeCollectionOperation: async (collection, operation) => {
  await validateVectorCompatibility(collection, currentEmbeddingService);
}
```

### 3. Documentación de Dimensiones
```markdown
# Crear archivo: EMBEDDING-SERVICES.md
## Servicios Disponibles y sus Dimensiones
- OpenAI (1536D): Mejor calidad, requiere API key
- Ollama (768D): Local, gratuito, buena calidad
- FastEmbed (384D): Más rápido, menor calidad
```

## 🔍 Testing de la Resolución

### Script de Verificación
```bash
#!/bin/bash
# test-vector-compatibility.sh

echo "🧪 Testing vector compatibility..."

# Test 1: Crear colección con Ollama
echo "Test 1: Crear colección con Ollama (768D)"
f1e_add_documents("test_file.txt", "test_collection", "ollama")

# Test 2: Verificar dimensiones
echo "Test 2: Verificar dimensiones"
curl http://host.docker.internal:6333/collections/test_collection

# Test 3: Intentar usar servicio incompatible
echo "Test 3: Intentar FastEmbed en colección Ollama (debería fallar)"
f1e_search("test query", "test_collection", "fastembed")

# Cleanup
f1e_delete_collection("test_collection")
```

## 📞 Resolución de Problemas Adicionales

### FAQ

**Q: ¿Por qué la colección tenía 1024 dimensiones?**
A: Probablemente fue creada con una configuración personalizada o un servicio que ya no está disponible.

**Q: ¿Puedo cambiar las dimensiones de una colección existente?**
A: No, Qdrant no permite cambiar las dimensiones. Hay que recrear la colección.

**Q: ¿Se pueden recuperar los datos después de eliminar la colección?**
A: Solo si creaste un backup previamente. Los scripts incluyen opciones de backup automático.

**Q: ¿Cuál es el mejor servicio de embeddings?**
A: Depende de tus necesidades:
- **Ollama**: Mejor balance calidad/privacidad (recomendado para desarrollo)
- **OpenAI**: Mejor calidad absoluta (requiere API key)
- **FastEmbed**: Más rápido (menor calidad)

---

## ✅ Checklist de Resolución

- [ ] Diagnosticar colecciones problemáticas
- [ ] Crear backup de datos importantes  
- [ ] Elegir servicio de embeddings estándar
- [ ] Eliminar colecciones incompatibles
- [ ] Verificar recreación automática
- [ ] Actualizar sistema de validación
- [ ] Documentar configuración final
- [ ] Ejecutar tests de compatibilidad

---

*Documento creado: $(date)*
*Versión: 1.0*
*Para uso con: Better Qdrant MCP Server*
