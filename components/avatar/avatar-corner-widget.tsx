"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  AvatarAction,
  AvatarDirective,
  AvatarLocomotion,
  AvatarMoveTarget,
} from "@/lib/avatar/types";

type AvatarCornerWidgetProps = {
  directive: AvatarDirective;
};

type ClipMeta = {
  index: number;
  name: string;
  duration: number;
};

const BASE_FACING_YAW = -Math.PI / 2;
const WALK_RIGHT_YAW = 0;
const WALK_LEFT_YAW = Math.PI;
const AVATAR_WIDTH = 298;
const AVATAR_HEIGHT = 350;
const STAGE_BOTTOM = 18;
const DEFAULT_IDLE_CLIP = 16;

const CLIP_GROUPS: Record<string, number[]> = {
  idle: [16, 19, 20, 18, 26],
  walk: [3, 5, 8, 9, 10, 13, 18, 20, 26],
  hop: [12, 18, 26, 10],
  thinking: [6, 15, 17, 19, 22, 24, 25],
  focus: [6, 17, 22, 24, 25],
  explain: [1, 2, 6, 15, 17, 22],
  greet: [13, 18, 20, 22],
  nod: [18, 20, 26],
  concern: [6, 19, 24, 25],
  celebrate: [0, 4, 7, 11, 14, 21, 23],
  dance: [0, 1, 2, 4, 7, 11, 14, 21, 23],
};

const STAGE_ANCHORS: Record<Exclude<AvatarMoveTarget, "wander">, number> = {
  left: 0.035,
  left_center: 0.18,
  center: 0.42,
  right_center: 0.64,
  composer: 0.76,
  tool_output: 0.88,
  right: 0.965,
};

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

const clampIndex = (index: number, length: number) =>
  Math.max(0, Math.min(length - 1, index));

const getAnchorRatio = (moveTo: AvatarMoveTarget, token: number) => {
  if (moveTo !== "wander") return STAGE_ANCHORS[moveTo];
  const wanderPoints = [
    STAGE_ANCHORS.left,
    STAGE_ANCHORS.left_center,
    STAGE_ANCHORS.center,
    STAGE_ANCHORS.right_center,
    STAGE_ANCHORS.composer,
    STAGE_ANCHORS.right,
  ];
  return wanderPoints[token % wanderPoints.length];
};

const pickClipPool = (
  action: AvatarAction,
  locomotion: AvatarLocomotion,
): number[] => {
  if (locomotion === "dance") return CLIP_GROUPS.dance;
  if (locomotion === "walk") return CLIP_GROUPS.walk;
  if (locomotion === "hop") return CLIP_GROUPS.hop;
  if (action === "celebrate") return CLIP_GROUPS.celebrate;
  if (action === "thinking") return CLIP_GROUPS.thinking;
  if (action === "focus") return CLIP_GROUPS.focus;
  if (action === "explain") return CLIP_GROUPS.explain;
  if (action === "greet") return CLIP_GROUPS.greet;
  if (action === "nod") return CLIP_GROUPS.nod;
  if (action === "concern") return CLIP_GROUPS.concern;
  return CLIP_GROUPS.idle;
};

const pickClipIndexForDirective = ({
  action,
  locomotion,
  clips,
  poolCursorRef,
}: {
  action: AvatarAction;
  locomotion: AvatarLocomotion;
  clips: ClipMeta[];
  poolCursorRef: { current: Record<string, number> };
}) => {
  if (!clips.length) return -1;

  const poolKey =
    locomotion !== "idle" ? `locomotion:${locomotion}` : `action:${action}`;
  const preferredPool = pickClipPool(action, locomotion).filter(
    (index) => index >= 0 && index < clips.length,
  );

  if (preferredPool.length === 0) {
    return clampIndex(DEFAULT_IDLE_CLIP, clips.length);
  }

  if (action === "idle" && locomotion === "idle") {
    return preferredPool.includes(DEFAULT_IDLE_CLIP)
      ? DEFAULT_IDLE_CLIP
      : preferredPool[0];
  }

  const cursor = poolCursorRef.current[poolKey] ?? 0;
  const next = preferredPool[cursor % preferredPool.length] ?? preferredPool[0];
  poolCursorRef.current[poolKey] = (cursor + 1) % preferredPool.length;
  return next;
};

export function AvatarCornerWidget({
  directive,
}: AvatarCornerWidgetProps) {
  const initialX =
    typeof window !== "undefined"
      ? Math.max(
          20,
          Math.min(
            window.innerWidth - AVATAR_WIDTH - 20,
            window.innerWidth * STAGE_ANCHORS.right - AVATAR_WIDTH / 2,
          ),
        )
      : 0;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const clipMetaRef = useRef<ClipMeta[]>([]);
  const activeClipIndexRef = useRef(-1);
  const poolCursorRef = useRef<Record<string, number>>({});
  const currentXRef = useRef(initialX);
  const targetXRef = useRef(initialX);
  const directiveRef = useRef(directive);
  const stageXRef = useRef(initialX);
  const [failed, setFailed] = useState(false);
  const [stageX, setStageX] = useState(initialX);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1440,
  );
  const [clearedDirectiveKey, setClearedDirectiveKey] = useState<string | null>(null);

  const directiveKey = useMemo(
    () =>
      JSON.stringify({
        bubble: directive.bubble,
        speak: directive.speak,
        action: directive.action,
        emotion: directive.emotion,
        lookAt: directive.lookAt,
        moveTo: directive.moveTo,
        locomotion: directive.locomotion,
        priority: directive.priority,
      }),
    [directive],
  );

  const anchorRatio = useMemo(() => {
    const seed = directiveKey
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return getAnchorRatio(directive.moveTo, seed);
  }, [directive.moveTo, directiveKey]);

  const targetX = useMemo(
    () =>
      Math.max(
        20,
        Math.min(
          viewportWidth - AVATAR_WIDTH - 20,
          viewportWidth * anchorRatio - AVATAR_WIDTH / 2,
        ),
      ),
    [anchorRatio, viewportWidth],
  );

  const activeDirective = useMemo(() => {
    if (clearedDirectiveKey !== directiveKey) return directive;
    return {
      ...directive,
      bubble: "",
      speak: false,
      action: "idle" as const,
      emotion: "neutral" as const,
      locomotion: "idle" as const,
    };
  }, [clearedDirectiveKey, directive, directiveKey]);

  useEffect(() => {
    directiveRef.current = activeDirective;
  }, [activeDirective]);

  useEffect(() => {
    targetXRef.current = targetX;
  }, [targetX]);

  useEffect(() => {
    if (!directive.bubble.trim()) return;
    const timeoutId = window.setTimeout(() => {
      setClearedDirectiveKey(directiveKey);
    }, 6000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [directive.bubble, directiveKey]);

  const resolvedLocomotion = useMemo(() => {
    const distance = Math.abs(targetX - stageX);
    if (activeDirective.locomotion === "dance") return "dance";
    if (distance > 18) return "walk";
    return "idle";
  }, [activeDirective.locomotion, stageX, targetX]);

  useEffect(() => {
    const actions = actionsRef.current;
    const clips = clipMetaRef.current;
    if (!actions.length || !clips.length) return;

    const nextIndex = pickClipIndexForDirective({
      action: activeDirective.action,
      locomotion: resolvedLocomotion,
      clips,
      poolCursorRef,
    });

    if (nextIndex < 0) return;
    if (nextIndex === activeClipIndexRef.current) return;

    const current = actions[activeClipIndexRef.current];
    const next = actions[nextIndex];
    current?.fadeOut(0.22);
    next?.reset().fadeIn(0.28).play();
    activeClipIndexRef.current = nextIndex;
  }, [activeDirective.action, resolvedLocomotion]);

  const bubbleToneClass = useMemo(() => {
    if (activeDirective.priority === "high") {
      return "border-amber-300/60 bg-[rgba(255,250,233,0.96)] text-amber-950";
    }
    if (activeDirective.emotion === "excited") {
      return "border-pink-200/60 bg-[rgba(255,246,252,0.96)] text-slate-900";
    }
    return "border-white/60 bg-[rgba(255,255,255,0.94)] text-slate-900";
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
    renderer.toneMappingExposure = 1.56;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableRotate = false;
    controls.target.set(0, 1.0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 2.05));
    scene.add(new THREE.HemisphereLight(0xf7fbff, 0xc8d8f2, 1.95));

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.8, 4.8, 3.8);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xeaf1ff, 1.55);
    fill.position.set(-2.6, 2.4, 2.2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xfff1fa, 0.95);
    rim.position.set(-2.8, 2.6, -2.2);
    scene.add(rim);

    const front = new THREE.PointLight(0xffffff, 1.45, 14);
    front.position.set(0, 1.4, 2.3);
    scene.add(front);

    const fitCameraToObject = (obj: THREE.Object3D) => {
      const box = getMeshBounds(obj);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const fov = (camera.fov * Math.PI) / 180;
      let cameraZ = Math.abs((maxDim / 2) / Math.tan(fov / 2));
      cameraZ *= 1.28;
      camera.position.set(center.x, center.y + size.y * 0.03, cameraZ);
      camera.lookAt(center.x, center.y + size.y * 0.05, center.z);
      controls.target.set(center.x, center.y + size.y * 0.05, center.z);
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
          setFailed(true);
          return;
        }

        const box = getMeshBounds(model);
        const size = box.getSize(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z);
        const scale = maxAxis > 0 ? 1.7 / maxAxis : 1;
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
                0.22,
                material.emissiveIntensity ?? 0.22,
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
            action.loop = THREE.LoopRepeat;
            return action;
          });
          const idleIndex = clampIndex(DEFAULT_IDLE_CLIP, gltf.animations.length);
          actionsRef.current[idleIndex]?.reset().fadeIn(0.1).play();
          activeClipIndexRef.current = idleIndex;
          mixerRef.current = mixer;
        } else {
          actionsRef.current = [];
          clipMetaRef.current = [];
        }

        setFailed(meshCount === 0);
      },
      undefined,
      (error) => {
        console.error("[AvatarCornerWidget] GLB load failed:", error);
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

      const targetX = targetXRef.current;
      const currentX = currentXRef.current;
        const nextX = THREE.MathUtils.lerp(currentX, targetX, 0.016);
      currentXRef.current = nextX;
      if (Math.abs(nextX - stageXRef.current) > 0.5) {
        stageXRef.current = nextX;
        setStageX(nextX);
      }

      if (modelRef.current) {
        const active = directiveRef.current;
        const moveDelta = targetXRef.current - currentXRef.current;
        const moving = Math.abs(moveDelta) > 4;
        const lookYaw =
          active.lookAt === "tool_output"
            ? -0.18
            : active.lookAt === "composer"
              ? -0.08
              : active.lookAt === "user"
                ? 0.08
                : 0;
        const walkYaw = moveDelta > 0 ? WALK_RIGHT_YAW : WALK_LEFT_YAW;
        const idleYaw = BASE_FACING_YAW + lookYaw;
        const targetYaw = moving ? walkYaw : idleYaw;
        const bobIntensity = moving
          ? active.locomotion === "hop"
            ? 0.03
            : 0.018
          : active.action === "celebrate"
            ? 0.022
            : active.action === "thinking" || active.action === "focus"
              ? 0.01
              : 0.005;
        const bobSpeed = moving
          ? active.locomotion === "hop"
            ? 8.5
            : 6.2
          : active.action === "celebrate"
            ? 8.2
            : active.speak
              ? 6.4
              : 3.2;

        modelRef.current.position.y = Math.sin(elapsed * bobSpeed) * bobIntensity;
        modelRef.current.rotation.y = THREE.MathUtils.lerp(
          modelRef.current.rotation.y,
          targetYaw,
          moving ? 0.08 : 0.06,
        );

        if (active.action === "thinking") {
          modelRef.current.rotation.z = Math.sin(elapsed * 1.8) * 0.03;
        } else if (active.action === "celebrate" || active.locomotion === "dance") {
          modelRef.current.rotation.z = Math.sin(elapsed * 5.5) * 0.065;
        } else if (moving) {
          modelRef.current.rotation.z = THREE.MathUtils.lerp(
            modelRef.current.rotation.z,
            moveDelta > 0 ? -0.035 : 0.035,
            0.1,
          );
        } else {
          modelRef.current.rotation.z *= 0.84;
        }
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
      setViewportWidth(window.innerWidth);
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
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [failed]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[160] h-[400px]">
      <div
        className="absolute"
        style={{
          left: stageX,
          bottom: STAGE_BOTTOM,
          width: AVATAR_WIDTH,
          height: AVATAR_HEIGHT,
        }}
      >
        {bubbleVisible ? (
          <div
            className={`absolute -top-1 left-1/2 z-30 max-w-[320px] -translate-x-1/2 rounded-2xl border px-3 py-2 text-[12px] leading-5 shadow-lg backdrop-blur-sm ${bubbleToneClass}`}
          >
            {activeDirective.bubble.trim()}
          </div>
        ) : null}
        <div className="relative h-full w-full overflow-hidden bg-transparent">
          <div ref={mountRef} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
