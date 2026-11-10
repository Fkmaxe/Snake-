export const meshVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iPosition;
layout(location=3) in vec3 iScale;
layout(location=4) in vec3 iColor;
layout(location=5) in vec2 iMaterial;
uniform mat4 uViewProjection;
out vec3 vWorld; out vec3 vNormal; out vec3 vColor; out float vEmission;
void main(){
  float c=cos(iMaterial.y),s=sin(iMaterial.y);
  mat3 rotation=mat3(c,0.,-s,0.,1.,0.,s,0.,c);
  vWorld=iPosition+rotation*(aPosition*iScale);
  vNormal=normalize(rotation*(aNormal/iScale));
  vColor=iColor; vEmission=iMaterial.x;
  gl_Position=uViewProjection*vec4(vWorld,1.);
}`;

export const meshFragment = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNormal; in vec3 vColor; in float vEmission;
uniform vec3 uEye; uniform vec3 uFood; uniform vec3 uHead;
uniform mat4 uLightViewProjection; uniform sampler2D uShadow; uniform float uShadowTexel;
out vec4 outColor;
float visibility(vec3 position){
  vec4 light=uLightViewProjection*vec4(position,1.);vec3 shadow=light.xyz/light.w*.5+.5;
  if(any(lessThan(shadow,vec3(0.)))||any(greaterThan(shadow,vec3(1.))))return 1.;
  float lit=0.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)lit+=step(shadow.z-.0018,texture(uShadow,shadow.xy+vec2(x,y)*uShadowTexel).r);
  return mix(.45,1.,lit/9.);
}
void main(){
  vec3 normal=normalize(vNormal);
  vec3 view=normalize(uEye-vWorld);
  vec3 light=normalize(vec3(-.4,1.,.6));
  float diffuse=max(dot(normal,light),0.);
  float specular=pow(max(dot(normal,normalize(light+view)),0.),48.);
  float fresnel=pow(1.-max(dot(normal,view),0.),3.);
  float foodLight=2.2/(1.+dot(uFood-vWorld,uFood-vWorld)*.35);
  float headLight=1.4/(1.+dot(uHead-vWorld,uHead-vWorld)*.3);
  float shadow=visibility(vWorld);
  vec3 color=vColor*(.24+diffuse*.64*shadow)+specular*vec3(.5,.75,.7)*.5*shadow;
  color+=vColor*vEmission+fresnel*vColor*.24;
  color+=vec3(1.,.48,.12)*foodLight*.09+vec3(.2,1.,.7)*headLight*.08;
  float fog=1.-exp(-length(uEye-vWorld)*.006);
  color=mix(color,vec3(.018,.031,.033),fog*.45);
  outColor=vec4(color,1.);
}`;

export const floorVertex = `#version 300 es
precision highp float;
uniform mat4 uViewProjection; uniform float uHalf;
out vec2 vPosition;
const vec2 points[6]=vec2[6](vec2(-1.,-1.),vec2(1.,-1.),vec2(1.,1.),vec2(-1.,-1.),vec2(1.,1.),vec2(-1.,1.));
void main(){vPosition=points[gl_VertexID]*uHalf;gl_Position=uViewProjection*vec4(vPosition.x,.018,vPosition.y,1.);}
`;
export const depthFragment = `#version 300 es
precision highp float;
void main(){}
`;
export const floorFragment = `#version 300 es
precision highp float;
in vec2 vPosition;
uniform float uTime; uniform float uHalf; uniform vec3 uFood; uniform vec3 uHead; uniform vec3 uTint;
uniform mat4 uLightViewProjection; uniform sampler2D uShadow; uniform float uShadowTexel;
out vec4 outColor;
void main(){
  vec2 grid=abs(fract(vPosition)-.5);
  vec2 width=max(fwidth(vPosition),vec2(.001));
  vec2 line=1.-smoothstep(vec2(.5)-width*.6,vec2(.5),grid);
  float lines=1.-min(line.x,line.y);
  vec2 majorGrid=abs(fract(vPosition/4.)-.5);
  float major=max(smoothstep(.487,.5,majorGrid.x),smoothstep(.487,.5,majorGrid.y));
  float edge=1.-smoothstep(uHalf-.08,uHalf,max(abs(vPosition.x),abs(vPosition.y)));
  float foodDistance=length(vPosition-uFood.xz);
  float headDistance=length(vPosition-uHead.xz);
  float foodGlow=exp(-foodDistance*1.1);
  float headGlow=exp(-headDistance*.72);
  float foodRing=(1.-smoothstep(.012,.055,abs(foodDistance-(.7+fract(uTime*.5)*1.4))))*(1.-fract(uTime*.5));
  float scan=exp(-abs(length(vPosition)-mod(uTime*2.,40.))*6.)*.035;
  vec3 color=vec3(.023,.047,.049)+uTint*lines*.047+uTint*major*.012;
  color+=uTint*headGlow*.11+vec3(1.,.4,.08)*(foodGlow*.2+foodRing*.16);
  color+=uTint*scan+uTint*(1.-edge)*.35;
  // A subtle circuit weave lives entirely in the fragment shader.
  float dotGrid=(1.-smoothstep(.03,.065,length(fract(vPosition)-.5)))*.055;
  color+=uTint*dotGrid;
  vec4 light=uLightViewProjection*vec4(vPosition.x,.018,vPosition.y,1.);vec3 shadow=light.xyz/light.w*.5+.5;
  float lit=0.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)lit+=step(shadow.z-.0007,texture(uShadow,shadow.xy+vec2(x,y)*uShadowTexel).r);
  color*=mix(.42,1.,lit/9.);
  outColor=vec4(color,1.);
}`;

export const screenVertex = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}
`;
export const bloomFragment = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTexture; uniform vec2 uDirection; uniform bool uExtract;
out vec4 outColor;
vec3 sampleLight(vec2 uv){vec3 c=texture(uTexture,uv).rgb;return uExtract ? c*smoothstep(.42,.85,max(c.r,max(c.g,c.b))) : c;}
void main(){
  vec3 c=sampleLight(vUv)*.227027;
  c+=sampleLight(vUv+uDirection*1.384615)*.316216;
  c+=sampleLight(vUv-uDirection*1.384615)*.316216;
  c+=sampleLight(vUv+uDirection*3.230769)*.070270;
  c+=sampleLight(vUv-uDirection*3.230769)*.070270;
  outColor=vec4(c,1.);
}`;
export const compositeFragment = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uScene; uniform sampler2D uBloom; uniform sampler2D uDepth;
uniform float uBloomStrength; uniform float uTime; uniform float uImpact; uniform float uExposure;
uniform vec2 uResolution; uniform vec2 uClip; uniform float uFocus; uniform float uDof; uniform float uSpeed;
out vec4 outColor;
void main(){
  vec2 radial=vUv-.5; vec2 chroma=radial*uImpact*.003;
  vec3 color=texture(uScene,vUv).rgb;
  float depth=texture(uDepth,vUv).r*2.-1.;
  float distance=(2.*uClip.x*uClip.y)/(uClip.y+uClip.x-depth*(uClip.y-uClip.x));
  float coc=clamp(abs(distance-uFocus)/uFocus,0.,1.)*uDof;
  if(coc>.1){
    vec3 blur=color;
    for(int i=0;i<8;i++){
      float angle=float(i)*.785398;vec2 offset=vec2(cos(angle),sin(angle))*coc/uResolution;
      blur+=texture(uScene,vUv+offset).rgb;
    }
    color=blur/9.;
  }
  if(uSpeed>0.){
    vec3 streak=color;
    for(int i=1;i<=4;i++)streak+=texture(uScene,vUv-radial*float(i)*uSpeed).rgb;
    color=mix(color,streak/5.,smoothstep(.08,.35,length(radial))*.55);
  }
  color.r=mix(color.r,texture(uScene,vUv+chroma).r,uImpact);color.b=mix(color.b,texture(uScene,vUv-chroma).b,uImpact);
  color+=texture(uBloom,vUv).rgb*uBloomStrength;
  color=1.-exp(-color*uExposure);
  color=pow(color,vec3(.87));
  float vignette=1.-dot(radial,radial)*.65;
  float grain=fract(sin(dot(vUv+fract(uTime),vec2(12.9898,78.233)))*43758.5453)-.5;
  color=color*vignette+grain*.008;
  outColor=vec4(color,1.);
}`;
export const particleVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition; layout(location=1) in vec4 aColor; layout(location=2) in float aSize;
uniform mat4 uViewProjection; uniform float uPixelRatio;
out vec4 vColor;
void main(){gl_Position=uViewProjection*vec4(aPosition,1.);gl_PointSize=clamp(aSize*uPixelRatio*220./gl_Position.w,1.,40.);vColor=aColor;}
`;
export const particleFragment = `#version 300 es
precision highp float;
in vec4 vColor; out vec4 outColor;
void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=pow(1.-d,1.6);outColor=vec4(vColor.rgb,vColor.a*a);}
`;
