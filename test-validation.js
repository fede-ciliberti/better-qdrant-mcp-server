#!/usr/bin/env node

import { createQdrantService } from './build/services/qdrant.js';
import { VectorValidationService } from './build/services/validation.js';

/**
 * Test script para verificar que el sistema de validación funciona correctamente
 */
async function testValidation() {
  console.log('🧪 Testing validation system...\n');

  try {
    // Crear servicios (sin conexión real a Qdrant)
    const qdrantService = createQdrantService('http://localhost:6333');
    const validationService = new VectorValidationService(qdrantService);

    // Test 1: Validar datos de vectores
    console.log('📊 Test 1: Vector data validation');
    
    const validVectors = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
    const validResult = validationService.validateVectorData(validVectors, 3);
    console.log('Valid vectors result:', {
      isValid: validResult.isValid,
      errors: validResult.errors,
      warnings: validResult.warnings
    });

    const invalidVectors = [[0.1, 0.2], [0.4, 0.5, 0.6, 0.7]]; // Different sizes
    const invalidResult = validationService.validateVectorData(invalidVectors, 3);
    console.log('Invalid vectors result:', {
      isValid: invalidResult.isValid,
      errors: invalidResult.errors,
      warnings: invalidResult.warnings
    });

    // Test 2: Obtener recomendaciones de servicios de embeddings
    console.log('\n🎯 Test 2: Embedding service recommendations');
    const recommendations = validationService.getEmbeddingServiceRecommendations();
    console.log('Available embedding services:');
    recommendations.forEach(rec => {
      console.log(`- ${rec.service} (${rec.model}): ${rec.vectorSize}D vectors`);
      console.log(`  Use case: ${rec.useCase}`);
      console.log(`  Pros: ${rec.pros.join(', ')}`);
      console.log(`  Cons: ${rec.cons.join(', ')}\n`);
    });

    console.log('✅ Validation system tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testValidation();
