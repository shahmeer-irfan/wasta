'use client';

import { useRef, useEffect } from 'react';

// Light theme shader — white background with subtle orange energy streaks
const SHADER_SOURCE = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)

float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}

float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float a=rnd(i), b=rnd(i+vec2(1,0)), c=rnd(i+vec2(0,1)), d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}

float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) { t+=a*noise(p); p*=2.*m; a*=.5; }
  return t;
}

void main(void) {
  vec2 uv=(FC-.5*R)/MN;
  vec2 st=uv*vec2(2,1);

  // Start with a very clean off-white
  vec3 col=vec3(1.0, 0.99, 0.98);

  float d = length(uv);
  float bg = fbm(vec2(st.x+T*0.2, -st.y*0.2));

  // Vibrant orange energy streaks
  for (float i=1.; i<7.; i++) {
    vec2 p = uv;
    p.x += 0.3*sin(i*1.5+T*0.6+p.y*2.0);
    p.y += 0.1*cos(i*0.8+T*0.4);
    float streak = 0.003/abs(p.y-0.12*sin(p.x*3.5+T*1.2+i*0.5));

    // Dynamic orange gradient: Amber to Gold
    vec3 c1 = vec3(1.0, 0.45, 0.1); // Amber
    vec3 c2 = vec3(1.0, 0.75, 0.2); // Gold
    vec3 streakColor = mix(c1, c2, 0.5 + 0.5*sin(p.x*2.0 + i + T));
    
    float intensity = streak * 0.4 * (0.6 + 0.4*sin(i + T*0.5));
    col = mix(col, streakColor, clamp(intensity, 0.0, 0.4));
  }

  // Warm radial glow from center
  float glow = 0.05/(d+0.5);
  col = mix(col, vec3(1.0, 0.8, 0.6), glow * 0.25);

  // Subtle background texture
  col = mix(col, vec3(1.0, 0.9, 0.7), bg * 0.03);

  // Gentle vignette
  col *= 1.0 - d*d*0.04;

  O=vec4(col,1);
}`;

const VERTEX_SOURCE = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

export default function EmergencyShader({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2');
    if (!gl) return;

    const dpr = Math.max(1, 0.5 * window.devicePixelRatio);

    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SOURCE);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, SHADER_SOURCE);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(fs));
      return;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,-1,-1,1,1,1,-1]), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resLoc = gl.getUniformLocation(program, 'resolution');
    const timeLoc = gl.getUniformLocation(program, 'time');

    const loop = (now: number) => {
      gl.useProgram(program);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform1f(timeLoc, now * 0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{ background: '#fffaf5' }}
    />
  );
}
