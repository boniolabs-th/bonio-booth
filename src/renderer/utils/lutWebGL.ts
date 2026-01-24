/**
 * WebGL-accelerated 3D LUT Processor
 * Uses GPU for ultra-fast color grading on large images
 *
 * Performance: ~10-100x faster than CPU for large images
 */

import { LUT3D } from './lutProcessor';

// Vertex shader - simple passthrough
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// Fragment shader - applies 3D LUT with trilinear interpolation
const FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D u_image;
  uniform sampler2D u_lut;
  uniform float u_lutSize;
  uniform vec3 u_domainMin;
  uniform vec3 u_domainMax;

  varying vec2 v_texCoord;

  vec3 applyLUT(vec3 color) {
    // Normalize to domain
    vec3 range = u_domainMax - u_domainMin;
    vec3 normalizedColor = (color - u_domainMin) / range;
    normalizedColor = clamp(normalizedColor, 0.0, 1.0);

    // Calculate LUT coordinates
    float lutSizeMinusOne = u_lutSize - 1.0;
    vec3 lutCoord = normalizedColor * lutSizeMinusOne;

    // Get the integer and fractional parts
    vec3 lutCoordFloor = floor(lutCoord);
    vec3 lutCoordFrac = lutCoord - lutCoordFloor;

    // Calculate texture coordinates for 8 corners of the cube
    // LUT is stored as a 2D texture: (size * size) x size
    float texWidth = u_lutSize * u_lutSize;
    float texHeight = u_lutSize;

    // Helper function inlined for GLSL compatibility
    // Index calculation: r + g * lutSize + b * lutSize * lutSize

    // Sample 8 corners for trilinear interpolation
    vec3 c000, c001, c010, c011, c100, c101, c110, c111;

    float rLow = lutCoordFloor.r;
    float gLow = lutCoordFloor.g;
    float bLow = lutCoordFloor.b;
    float rHigh = min(rLow + 1.0, lutSizeMinusOne);
    float gHigh = min(gLow + 1.0, lutSizeMinusOne);
    float bHigh = min(bLow + 1.0, lutSizeMinusOne);

    // Calculate 2D texture coordinates from 3D LUT index
    // The LUT is stored row by row: each row is one blue slice
    // Within each slice, red is X, green is Y

    // Helper macro-like calculations
    #define SAMPLE_LUT(r, g, b) texture2D(u_lut, vec2((r + g * u_lutSize + 0.5) / texWidth, (b + 0.5) / texHeight)).rgb

    c000 = SAMPLE_LUT(rLow, gLow, bLow);
    c100 = SAMPLE_LUT(rHigh, gLow, bLow);
    c010 = SAMPLE_LUT(rLow, gHigh, bLow);
    c110 = SAMPLE_LUT(rHigh, gHigh, bLow);
    c001 = SAMPLE_LUT(rLow, gLow, bHigh);
    c101 = SAMPLE_LUT(rHigh, gLow, bHigh);
    c011 = SAMPLE_LUT(rLow, gHigh, bHigh);
    c111 = SAMPLE_LUT(rHigh, gHigh, bHigh);

    // Trilinear interpolation
    float rFrac = lutCoordFrac.r;
    float gFrac = lutCoordFrac.g;
    float bFrac = lutCoordFrac.b;

    vec3 c00 = mix(c000, c100, rFrac);
    vec3 c01 = mix(c001, c101, rFrac);
    vec3 c10 = mix(c010, c110, rFrac);
    vec3 c11 = mix(c011, c111, rFrac);

    vec3 c0 = mix(c00, c10, gFrac);
    vec3 c1 = mix(c01, c11, gFrac);

    return mix(c0, c1, bFrac);
  }

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    vec3 lutColor = applyLUT(color.rgb);
    gl_FragColor = vec4(lutColor, color.a);
  }
`;

let gl: WebGLRenderingContext | null = null;
let glCanvas: HTMLCanvasElement | null = null;
let program: WebGLProgram | null = null;
let lutTexture: WebGLTexture | null = null;
let cachedLutSize: number = 0;

/**
 * Check if WebGL is available
 */
export const isWebGLAvailable = (): boolean => {
  try {
    const testCanvas = document.createElement('canvas');
    const context = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    return context !== null;
  } catch {
    return false;
  }
};

/**
 * Initialize WebGL context and shaders
 */
const initWebGL = (): WebGLRenderingContext | null => {
  if (gl && glCanvas) return gl;

  // Create internal canvas for WebGL rendering
  glCanvas = document.createElement('canvas');
  const context = glCanvas.getContext('webgl', {
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  }) as WebGLRenderingContext | null;

  if (!context) {
    console.warn('[LUT WebGL] WebGL not available');
    glCanvas = null;
    return null;
  }

  gl = context;

  // Compile shaders
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

  if (!vertexShader || !fragmentShader) {
    console.error('[LUT WebGL] Failed to compile shaders');
    gl = null;
    glCanvas = null;
    return null;
  }

  // Create program
  program = gl.createProgram();
  if (!program) {
    gl = null;
    glCanvas = null;
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[LUT WebGL] Program link failed:', gl.getProgramInfoLog(program));
    gl = null;
    glCanvas = null;
    return null;
  }

  console.log('[LUT WebGL] Initialized successfully');
  return gl;
};

/**
 * Compile a shader
 */
const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[LUT WebGL] Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
};

/**
 * Create LUT texture from LUT data
 */
const createLUTTexture = (gl: WebGLRenderingContext, lut: LUT3D): WebGLTexture | null => {
  // If same LUT size, reuse texture
  if (lutTexture && cachedLutSize === lut.size) {
    // Update texture data
    const lutData = new Uint8Array(lut.size * lut.size * lut.size * 4);
    for (let i = 0; i < lut.data.length / 3; i++) {
      lutData[i * 4] = Math.round(lut.data[i * 3] * 255);
      lutData[i * 4 + 1] = Math.round(lut.data[i * 3 + 1] * 255);
      lutData[i * 4 + 2] = Math.round(lut.data[i * 3 + 2] * 255);
      lutData[i * 4 + 3] = 255;
    }

    gl.bindTexture(gl.TEXTURE_2D, lutTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      lut.size * lut.size,
      lut.size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      lutData,
    );
    return lutTexture;
  }

  // Create new texture
  const texture = gl.createTexture();
  if (!texture) return null;

  // Convert LUT data to RGBA texture
  // Store as 2D texture: width = size*size, height = size
  const lutData = new Uint8Array(lut.size * lut.size * lut.size * 4);
  for (let i = 0; i < lut.data.length / 3; i++) {
    lutData[i * 4] = Math.round(lut.data[i * 3] * 255);
    lutData[i * 4 + 1] = Math.round(lut.data[i * 3 + 1] * 255);
    lutData[i * 4 + 2] = Math.round(lut.data[i * 3 + 2] * 255);
    lutData[i * 4 + 3] = 255;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    lut.size * lut.size,
    lut.size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    lutData,
  );

  // Use NEAREST for exact LUT values (interpolation done in shader)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Cache
  if (lutTexture) {
    gl.deleteTexture(lutTexture);
  }
  lutTexture = texture;
  cachedLutSize = lut.size;

  return texture;
};

/**
 * Apply LUT using WebGL (GPU-accelerated)
 * Returns a new canvas with the processed image
 */
export const applyLUTWithWebGL = (
  sourceCanvas: HTMLCanvasElement,
  lut: LUT3D,
): HTMLCanvasElement | null => {
  const startTime = performance.now();

  // Initialize WebGL (creates internal canvas if needed)
  const glContext = initWebGL();
  if (!glContext || !program || !glCanvas) {
    console.warn('[LUT WebGL] Failed to initialize, falling back to CPU');
    return null;
  }

  // Resize WebGL canvas to match source
  glCanvas.width = sourceCanvas.width;
  glCanvas.height = sourceCanvas.height;

  // Set viewport
  glContext.viewport(0, 0, glCanvas.width, glCanvas.height);

  // Use program
  glContext.useProgram(program);

  // Create and bind source image texture
  const imageTexture = glContext.createTexture();
  glContext.activeTexture(glContext.TEXTURE0);
  glContext.bindTexture(glContext.TEXTURE_2D, imageTexture);
  glContext.texImage2D(
    glContext.TEXTURE_2D,
    0,
    glContext.RGBA,
    glContext.RGBA,
    glContext.UNSIGNED_BYTE,
    sourceCanvas,
  );
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MIN_FILTER, glContext.LINEAR);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_MAG_FILTER, glContext.LINEAR);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_S, glContext.CLAMP_TO_EDGE);
  glContext.texParameteri(glContext.TEXTURE_2D, glContext.TEXTURE_WRAP_T, glContext.CLAMP_TO_EDGE);

  // Create and bind LUT texture
  glContext.activeTexture(glContext.TEXTURE1);
  const lutTex = createLUTTexture(glContext, lut);
  if (!lutTex) {
    glContext.deleteTexture(imageTexture);
    return null;
  }

  // Set uniforms
  const imageLocation = glContext.getUniformLocation(program, 'u_image');
  const lutLocation = glContext.getUniformLocation(program, 'u_lut');
  const lutSizeLocation = glContext.getUniformLocation(program, 'u_lutSize');
  const domainMinLocation = glContext.getUniformLocation(program, 'u_domainMin');
  const domainMaxLocation = glContext.getUniformLocation(program, 'u_domainMax');

  glContext.uniform1i(imageLocation, 0);
  glContext.uniform1i(lutLocation, 1);
  glContext.uniform1f(lutSizeLocation, lut.size);
  glContext.uniform3fv(domainMinLocation, lut.domainMin);
  glContext.uniform3fv(domainMaxLocation, lut.domainMax);

  // Create geometry (fullscreen quad)
  const positionBuffer = glContext.createBuffer();
  glContext.bindBuffer(glContext.ARRAY_BUFFER, positionBuffer);
  glContext.bufferData(
    glContext.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]),
    glContext.STATIC_DRAW,
  );

  const positionLocation = glContext.getAttribLocation(program, 'a_position');
  glContext.enableVertexAttribArray(positionLocation);
  glContext.vertexAttribPointer(positionLocation, 2, glContext.FLOAT, false, 0, 0);

  // Texture coordinates
  const texCoordBuffer = glContext.createBuffer();
  glContext.bindBuffer(glContext.ARRAY_BUFFER, texCoordBuffer);
  glContext.bufferData(
    glContext.ARRAY_BUFFER,
    new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      0, 0,
      1, 1,
      1, 0,
    ]),
    glContext.STATIC_DRAW,
  );

  const texCoordLocation = glContext.getAttribLocation(program, 'a_texCoord');
  glContext.enableVertexAttribArray(texCoordLocation);
  glContext.vertexAttribPointer(texCoordLocation, 2, glContext.FLOAT, false, 0, 0);

  // Draw
  glContext.drawArrays(glContext.TRIANGLES, 0, 6);

  // Cleanup textures and buffers (but keep LUT texture cached)
  glContext.deleteTexture(imageTexture);
  glContext.deleteBuffer(positionBuffer);
  glContext.deleteBuffer(texCoordBuffer);

  // Copy result from WebGL canvas to output canvas
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const ctx2d = outputCanvas.getContext('2d', { colorSpace: 'srgb' });
  if (!ctx2d) {
    console.error('[LUT WebGL] Failed to create 2D context for output');
    return null;
  }
  ctx2d.drawImage(glCanvas, 0, 0);

  const elapsed = performance.now() - startTime;
  console.log(`[LUT WebGL] Processed ${sourceCanvas.width}x${sourceCanvas.height} in ${elapsed.toFixed(0)}ms`);

  return outputCanvas;
};

/**
 * Cleanup WebGL resources
 */
export const cleanupWebGL = (): void => {
  if (gl) {
    if (lutTexture) {
      gl.deleteTexture(lutTexture);
      lutTexture = null;
    }
    if (program) {
      gl.deleteProgram(program);
      program = null;
    }
    gl = null;
  }
  glCanvas = null;
  cachedLutSize = 0;
};
