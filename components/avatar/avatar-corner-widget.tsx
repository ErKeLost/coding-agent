"use client";

import { useEffect, useMemo, useRef, useState, type PointerEventHandler } from "react";
import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AvatarAction, AvatarDirective } from "@/lib/avatar/types";

type AvatarCornerWidgetProps = {
  directive: AvatarDirective;
  thinking?: boolean;
};

type ClipMeta = {
  index: number;
  name: string;
  duration: number;
};

const BASE_FACING_YAW = -Math.PI / 2;

const getMeshBounds = (root: THREE.Object3D): THREE.Box3 => {
  const bounds = new THREE.Box3();
  let hasMesh = false;
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    const localBox = geometry.boundingBox.clone();
    localBox.applyMatrix4(mesh.matrixWorld);
    if (!hasMesh) {
      bounds.copy(localBox);
      hasMesh = true;
    } else {
      bounds.union(localBox);
    }
  });

  if (!hasMesh) {
    return new THREE.Box3(
      new THREE.Vector3(-0.5, 0, -0.5),
      new THREE.Vector3(0.5, 1, 0.5),
    );
  }
  return bounds;
};

const pickClipIndexForAction = (action: AvatarAction, clips: ClipMeta[]) => {
  if (!clips.length) return 0;
  const byDurationAsc = [...clips].sort((a, b) => a.duration - b.duration);
  const byDurationDesc = [...clips].sort((a, b) => b.duration - a.duration);
  const medium = [...clips].sort(
    (a, b) => Math.abs(a.duration - 6) - Math.abs(b.duration - 6),
  );

  switch (action) {
    case "nod":
      return byDurationAsc[0]?.index ?? 0;
    case "greet":
      return medium[0]?.index ?? byDurationAsc[1]?.index ?? 0;
    case "thinking":
      return medium[1]?.index ?? medium[0]?.index ?? 0;
    case "focus":
      return byDurationAsc[1]?.index ?? medium[0]?.index ?? 0;
    case "explain":
      return medium[1]?.index ?? medium[0]?.index ?? 0;
    case "celebrate":
      return byDurationDesc[0]?.index ?? 0;
    case "concern":
      return byDurationAsc[1]?.index ?? byDurationAsc[0]?.index ?? 0;
    case "idle":
    default:
      return -1;
  }
};

export function AvatarCornerWidget({
  directive,
  thinking = false,
}: AvatarCornerWidgetProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const clipMetaRef = useRef<ClipMeta[]>([]);
  const activeClipIndexRef = useRef(0);
  const fallbackRef = useRef<THREE.Mesh | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const directiveRef = useRef(directive);
  const directiveTokenRef = useRef(0);
  const [activeDirective, setActiveDirective] = useState(directive);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    directiveTokenRef.current += 1;
    const token = directiveTokenRef.current;
    setActiveDirective(directive);

    const nextBubble = directive.bubble.trim();
    if (!nextBubble) return;

    const timeoutId = window.setTimeout(() => {
      if (directiveTokenRef.current !== token) return;
      setActiveDirective((current) => ({
        ...current,
        bubble: "",
        speak: false,
        action: "idle",
        emotion: "neutral",
      }));
    }, 6000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [directive]);

  useEffect(() => {
    directiveRef.current = activeDirective;
  }, [activeDirective]);

  useEffect(() => {
    const actions = actionsRef.current;
    const clips = clipMetaRef.current;
    if (!actions.length || !clips.length) return;

    const nextIndex = pickClipIndexForAction(activeDirective.action, clips);
    if (nextIndex < 0) {
      const current = actions[activeClipIndexRef.current];
      current?.fadeOut(0.25);
      activeClipIndexRef.current = -1;
      return;
    }
    if (nextIndex === activeClipIndexRef.current) return;

    const current = actions[activeClipIndexRef.current];
    const next = actions[nextIndex];
    current?.fadeOut(0.2);
    next?.reset().fadeIn(0.25).play();
    activeClipIndexRef.current = nextIndex;
  }, [activeDirective.action]);

  const bubbleToneClass = useMemo(() => {
    if (activeDirective.priority === "high") {
      return "border-amber-300/55 bg-[rgba(255,250,233,0.95)] text-amber-950";
    }
    if (activeDirective.emotion === "excited") {
      return "border-pink-200/60 bg-[rgba(255,247,252,0.95)] text-slate-900";
    }
    return "border-white/60 bg-[rgba(255,255,255,0.92)] text-slate-900";
  }, [activeDirective.emotion, activeDirective.priority]);
  const bubbleVisible = activeDirective.bubble.trim().length > 0;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1000);
    camera.position.set(0, 1.35, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.42;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minDistance = 1.1;
    controls.maxDistance = 5;
    controls.target.set(0, 1.0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.85));
    scene.add(new THREE.HemisphereLight(0xf1f6ff, 0x465678, 1.6));

    const key = new THREE.DirectionalLight(0xffffff, 1.95);
    key.position.set(2.2, 4.5, 3.2);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xd2ddff, 1.35);
    fill.position.set(-3.2, 2.2, -2.4);
    scene.add(fill);

    const front = new THREE.PointLight(0xffffff, 1.2, 12);
    front.position.set(0, 1.25, 2.1);
    scene.add(front);

    const fitCameraToObject = (obj: THREE.Object3D) => {
      const box = getMeshBounds(obj);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const fov = (camera.fov * Math.PI) / 180;
      let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2));
      cameraZ *= 1.22;
      camera.position.set(center.x, center.y + size.y * 0.08, cameraZ);
      camera.lookAt(center.x, center.y + size.y * 0.12, center.z);
      controls.target.set(center.x, center.y + size.y * 0.12, center.z);
      controls.update();
      camera.near = Math.max(0.01, maxDim / 200);
      camera.far = Math.max(100, maxDim * 20);
      camera.updateProjectionMatrix();
    };

    const loader = new GLTFLoader();
    loader.load(
      "/models/baobao.glb",
      (gltf) => {
        const model = gltf.scene ?? gltf.scenes?.[0];
        if (!model) {
          setReady(false);
          setFailed(true);
          return;
        }

        const box = getMeshBounds(model);
        const size = box.getSize(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z);
        const scale = maxAxis > 0 ? 1.8 / maxAxis : 1;
        model.scale.setScalar(scale);

        const scaledBox = getMeshBounds(model);
        const center = scaledBox.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= scaledBox.min.y;

        let meshCount = 0;
        model.traverse((obj) => {
          if (!(obj as THREE.Mesh).isMesh) return;
          meshCount += 1;
          const mesh = obj as THREE.Mesh;
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const material of materials) {
            if (!material) continue;
            material.side = THREE.DoubleSide;
            material.transparent = false;
            if ("opacity" in material) material.opacity = 1;
            if ("map" in material && material.map) {
              material.map.colorSpace = THREE.SRGBColorSpace;
              material.map.needsUpdate = true;
            }
            if ("aoMapIntensity" in material) material.aoMapIntensity = 0.45;
            if ("emissiveIntensity" in material) {
              material.emissiveIntensity = Math.max(
                0.2,
                material.emissiveIntensity ?? 0.2,
              );
            }
            material.needsUpdate = true;
          }
        });

        scene.add(model);
        modelRef.current = model;
        fitCameraToObject(model);

        if (gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(model);
          clipMetaRef.current = gltf.animations.map((clip, index) => ({
            index,
            name: clip.name || `clip-${index + 1}`,
            duration: clip.duration,
          }));
          actionsRef.current = gltf.animations.map((clip) => {
            const action = mixer.clipAction(clip);
            action.enabled = true;
            action.clampWhenFinished = false;
            return action;
          });
          activeClipIndexRef.current = -1;
          mixerRef.current = mixer;
        } else {
          actionsRef.current = [];
          clipMetaRef.current = [];
        }

        setReady(meshCount > 0);
        setFailed(meshCount === 0);
      },
      undefined,
      (error) => {
        console.error("[AvatarCornerWidget] GLB load failed:", error);
        setReady(false);
        setFailed(true);
      },
    );

    const clock = new THREE.Clock();
    let rafId = 0;

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      mixerRef.current?.update(delta);
      controls.update();

      if (modelRef.current) {
        const active = directiveRef.current;
        const yawOffset =
          active.lookAt === "tool_output"
            ? -0.22
            : active.lookAt === "composer"
              ? -0.08
              : active.lookAt === "user"
                ? 0
                : -0.05;
        const targetYaw = BASE_FACING_YAW + yawOffset;
        const bobIntensity =
          active.speak || active.action === "celebrate"
            ? 0.02
            : active.action === "thinking" || active.action === "focus"
              ? 0.008
              : 0.004;
        const bobSpeed = active.action === "celebrate" ? 9 : active.speak ? 7.5 : 3.4;
        modelRef.current.position.y =
          Math.sin(elapsed * bobSpeed) * bobIntensity;
        modelRef.current.rotation.y = THREE.MathUtils.lerp(
          modelRef.current.rotation.y,
          targetYaw,
          0.08,
        );
        if (active.action === "thinking") {
          modelRef.current.rotation.z = Math.sin(elapsed * 1.8) * 0.03;
        } else if (active.action === "celebrate") {
          modelRef.current.rotation.z = Math.sin(elapsed * 5.5) * 0.06;
        } else {
          modelRef.current.rotation.z *= 0.84;
        }
      }

      if (failed && !fallbackRef.current) {
        const fallback = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.5, 1),
          new THREE.MeshStandardMaterial({
            color: "#9cb8ff",
            roughness: 0.4,
            metalness: 0.2,
          }),
        );
        fallback.position.set(0, 1.2, 0);
        scene.add(fallback);
        fallbackRef.current = fallback;
      }

      if (fallbackRef.current) {
        fallbackRef.current.rotation.y += 0.01;
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      mixerRef.current?.stopAllAction();
      actionsRef.current = [];
      clipMetaRef.current = [];
      controls.dispose();
      modelRef.current = null;
      fallbackRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [failed]);

  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    const target = event.currentTarget;
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: event.clientX - offset.x,
      y: event.clientY - offset.y,
    };
    target.setPointerCapture(event.pointerId);
  };

  const onPointerMove: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!draggingRef.current) return;
    const nextX = event.clientX - dragOffsetRef.current.x;
    const nextY = event.clientY - dragOffsetRef.current.y;
    const minX = -window.innerWidth + 80;
    const maxX = 40;
    const minY = -window.innerHeight + 80;
    const maxY = 40;
    setOffset({
      x: Math.max(minX, Math.min(maxX, nextX)),
      y: Math.max(minY, Math.min(maxY, nextY)),
    });
  };

  const onPointerUp: PointerEventHandler<HTMLDivElement> = (event) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="pointer-events-auto fixed z-[90] h-[320px] w-[250px] select-none touch-none"
      style={{
        right: 20,
        bottom: 20,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
      }}
    >
      {bubbleVisible ? (
        <div
          className={`absolute right-10 top-1 z-30 max-w-[240px] rounded-2xl border px-3 py-2 text-[12px] leading-5 shadow-lg backdrop-blur-sm ${bubbleToneClass}`}
        >
          {activeDirective.bubble.trim()}
        </div>
      ) : null}
      <div className="relative h-full w-full overflow-hidden bg-transparent">
        <div
          className="absolute inset-x-0 top-0 z-20 h-8 cursor-move bg-transparent"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div ref={mountRef} className="h-full w-full" />
        {!ready ? (
          <div className="pointer-events-none absolute top-3 right-3 z-20 text-foreground/70">
            {failed ? (
              <SparklesIcon className="size-4" />
            ) : (
              <LoaderCircleIcon
                className={`size-4 ${thinking ? "animate-spin" : "animate-spin"}`}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
