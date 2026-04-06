"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  AvatarAction,
  AvatarBubbleTheme,
  AvatarDirective,
  AvatarLocomotion,
} from "@/lib/avatar/types";
import { inferClipGroupsFromAnimationCount } from "@/lib/avatar/models";

type AvatarCornerWidgetProps = {
  directive: AvatarDirective;
  dock?: "overlay" | "sidebar";
  modelPath?: string;
};

type ClipMeta = {
  index: number;
  name: string;
  duration: number;
};

const BASE_FACING_YAW = -Math.PI / 2;
const WALK_RIGHT_YAW = BASE_FACING_YAW + 0.22;
const WALK_LEFT_YAW = BASE_FACING_YAW - 0.22;
const AVATAR_WIDTH = 212;
const AVATAR_HEIGHT = 268;
const STAGE_BOTTOM = 0;
const STAGE_SIDE_PADDING = 14;
const STAGE_MIN_WIDTH = 360;
const DEFAULT_IDLE_CLIP = 16;
const INITIAL_DOCK_X = 8;
const DRAG_THRESHOLD = 6;

const getStageWidth = (viewportWidth: number) =>
  Math.max(viewportWidth, STAGE_MIN_WIDTH);

const getDockedLeftX = (
  stageWidth: number,
  avatarWidth: number,
  stageSidePadding: number,
) =>
  Math.max(
    stageSidePadding,
    Math.min(
      stageWidth - avatarWidth - stageSidePadding,
      INITIAL_DOCK_X,
    ),
  );

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

const pickClipPool = (
  action: AvatarAction,
  locomotion: AvatarLocomotion,
  clipGroups: Partial<Record<string, number[]>>,
): number[] => {
  if (locomotion === "dance") return clipGroups.dance ?? [];
  if (locomotion === "walk") return clipGroups.walk ?? [];
  if (locomotion === "hop") return clipGroups.hop ?? [];
  if (action === "celebrate") return clipGroups.celebrate ?? [];
  if (action === "thinking") return clipGroups.thinking ?? [];
  if (action === "focus") return clipGroups.focus ?? [];
  if (action === "explain") return clipGroups.explain ?? [];
  if (action === "greet") return clipGroups.greet ?? [];
  if (action === "nod") return clipGroups.nod ?? [];
  if (action === "concern") return clipGroups.concern ?? [];
  return clipGroups.idle ?? [];
};

const pickClipIndexForDirective = ({
  action,
  locomotion,
  clips,
  clipGroups,
  poolCursorRef,
}: {
  action: AvatarAction;
  locomotion: AvatarLocomotion;
  clips: ClipMeta[];
  clipGroups: Partial<Record<string, number[]>>;
  poolCursorRef: { current: Record<string, number> };
}) => {
  if (!clips.length) return -1;

  const poolKey =
    locomotion !== "idle" ? `locomotion:${locomotion}` : `action:${action}`;
  const preferredPool = pickClipPool(action, locomotion, clipGroups).filter(
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

const FALLBACK_BUBBLE_THEME_BY_EMOTION: Record<
  AvatarDirective["emotion"],
  Required<AvatarBubbleTheme>
> = {
  neutral: {
    borderColor: "#dbe7ff",
    textColor: "#1f2937",
    backgroundFrom: "#fbfdff",
    backgroundTo: "#edf4ff",
    glowColor: "rgba(105, 156, 255, 0.2)",
  },
  warm: {
    borderColor: "#fde6d5",
    textColor: "#7c2d12",
    backgroundFrom: "#fff8f0",
    backgroundTo: "#ffeede",
    glowColor: "rgba(251, 146, 60, 0.22)",
  },
  focused: {
    borderColor: "#bfdbfe",
    textColor: "#1e3a8a",
    backgroundFrom: "#f5faff",
    backgroundTo: "#e7f1ff",
    glowColor: "rgba(59, 130, 246, 0.24)",
  },
  excited: {
    borderColor: "#fbcfe8",
    textColor: "#831843",
    backgroundFrom: "#fff2fb",
    backgroundTo: "#ffe5f5",
    glowColor: "rgba(236, 72, 153, 0.26)",
  },
  concerned: {
    borderColor: "#fcd34d",
    textColor: "#451a03",
    backgroundFrom: "#fff9e9",
    backgroundTo: "#ffefcc",
    glowColor: "rgba(245, 158, 11, 0.3)",
  },
};

export function AvatarCornerWidget({
  directive,
  dock = "overlay",
  modelPath = "/models/baobao.glb",
}: AvatarCornerWidgetProps) {
  const isSidebar = dock === "sidebar";
  const avatarWidth = isSidebar ? 176 : AVATAR_WIDTH;
  const avatarHeight = isSidebar ? 220 : AVATAR_HEIGHT;
  const stageBottom = isSidebar ? 0 : STAGE_BOTTOM;
  const stageSidePadding = isSidebar ? 10 : STAGE_SIDE_PADDING;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialViewportWidth = 1440;
  const initialStageWidth = isSidebar ? 272 : getStageWidth(initialViewportWidth);
  const initialX = getDockedLeftX(
    initialStageWidth,
    avatarWidth,
    stageSidePadding,
  );
  const mountRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const clipMetaRef = useRef<ClipMeta[]>([]);
  const activeClipIndexRef = useRef(-1);
  const poolCursorRef = useRef<Record<string, number>>({});
  const clipGroupsRef = useRef<Partial<Record<string, number[]>>>({});
  const currentXRef = useRef(initialX);
  const targetXRef = useRef(initialX);
  const directiveRef = useRef(directive);
  const stageXRef = useRef(initialX);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originBottom: number;
    moved: boolean;
  } | null>(null);
  const [stageX, setStageX] = useState(initialX);
  const [stageWidth, setStageWidth] = useState(initialStageWidth);
  const [clearedDirectiveKey, setClearedDirectiveKey] = useState<string | null>(null);
  const [manualTargetX, setManualTargetX] = useState<number | null>(null);
  const [manualBottom, setManualBottom] = useState<number | null>(null);

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

  const targetX = useMemo(() => {
    return manualTargetX ?? getDockedLeftX(stageWidth, avatarWidth, stageSidePadding);
  }, [avatarWidth, manualTargetX, stageSidePadding, stageWidth]);
  const effectiveBottom = manualBottom ?? stageBottom;

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
    if (manualTargetX != null || manualBottom != null) return "idle";
    if (activeDirective.locomotion === "dance") return "dance";
    return "idle";
  }, [activeDirective.locomotion, manualBottom, manualTargetX]);

  useEffect(() => {
    const actions = actionsRef.current;
    const clips = clipMetaRef.current;
    if (!actions.length || !clips.length) return;

    const nextIndex = pickClipIndexForDirective({
      action: activeDirective.action,
      locomotion: resolvedLocomotion,
      clips,
      clipGroups: clipGroupsRef.current,
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

  const bubbleVisible = activeDirective.bubble.trim().length > 0;
  const bubbleTheme = useMemo(() => {
    const fallback = FALLBACK_BUBBLE_THEME_BY_EMOTION[activeDirective.emotion];
    return {
      borderColor:
        activeDirective.bubbleTheme?.borderColor ??
        (activeDirective.priority === "high" ? "#f59e0b" : fallback.borderColor),
      textColor: activeDirective.bubbleTheme?.textColor ?? fallback.textColor,
      backgroundFrom:
        activeDirective.bubbleTheme?.backgroundFrom ?? fallback.backgroundFrom,
      backgroundTo: activeDirective.bubbleTheme?.backgroundTo ?? fallback.backgroundTo,
      glowColor:
        activeDirective.bubbleTheme?.glowColor ??
        (activeDirective.priority === "high"
          ? "rgba(245, 158, 11, 0.34)"
          : fallback.glowColor),
    };
  }, [activeDirective.bubbleTheme, activeDirective.emotion, activeDirective.priority]);

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
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableRotate = false;
    controls.target.set(0, 1.0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    scene.add(new THREE.HemisphereLight(0xf7fbff, 0xc8d8f2, 0.9));

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(2.8, 4.8, 3.8);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xeaf1ff, 0.6);
    fill.position.set(-2.6, 2.4, 2.2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xfff1fa, 0.35);
    rim.position.set(-2.8, 2.6, -2.2);
    scene.add(rim);

    const front = new THREE.PointLight(0xffffff, 0.35, 14);
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
      modelPath,
      (gltf) => {
        const model = gltf.scene ?? gltf.scenes?.[0];
        if (!model) {
          console.warn("[AvatarCornerWidget] GLB loaded without a scene.");
          return;
        }

        const box = getMeshBounds(model);
        const size = box.getSize(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z);
        const scale = maxAxis > 0 ? (isSidebar ? 1.52 : 1.28) / maxAxis : 1;
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
            if ("aoMapIntensity" in material) material.aoMapIntensity = 0.75;
            if ("emissiveIntensity" in material) {
              material.emissiveIntensity = Math.max(
                0.06,
                material.emissiveIntensity ?? 0.06,
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
          clipGroupsRef.current = inferClipGroupsFromAnimationCount(
            gltf.animations.length,
          );
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
          clipGroupsRef.current = {};
        }

        if (meshCount === 0) {
          console.warn("[AvatarCornerWidget] GLB loaded without mesh content.");
        }
      },
      undefined,
      (error) => {
        console.error("[AvatarCornerWidget] GLB load failed:", error);
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
            ? 0.025
            : 0.014
          : active.action === "thinking" || active.action === "focus"
            ? 0.008
            : 0.003;
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
          moving ? 0.05 : 0.06,
        );

        if (active.action === "thinking") {
          modelRef.current.rotation.z = Math.sin(elapsed * 1.8) * 0.03;
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
        if (isSidebar) {
          const sidebarWidth = containerRef.current?.clientWidth ?? width;
          setStageWidth(Math.max(sidebarWidth, avatarWidth + stageSidePadding * 2));
        } else {
          const nextViewportWidth = window.innerWidth;
          setStageWidth(getStageWidth(nextViewportWidth));
        }
      };

      window.addEventListener("resize", onResize);
      let resizeObserver: ResizeObserver | null = null;
      if (isSidebar && containerRef.current && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          onResize();
        });
        resizeObserver.observe(containerRef.current);
      }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
      mixerRef.current?.stopAllAction();
      actionsRef.current = [];
      clipMetaRef.current = [];
      clipGroupsRef.current = {};
      controls.dispose();
      modelRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [avatarWidth, isSidebar, modelPath, stageSidePadding]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isSidebar) return;
    const originBottom = manualBottom ?? stageBottom;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: currentXRef.current,
      originBottom,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isSidebar) return;
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
      drag.moved = true;
    }

    const nextX = Math.max(
      stageSidePadding,
      Math.min(
        stageWidth - avatarWidth - stageSidePadding,
        drag.originX + deltaX,
      ),
    );
    const viewportHeight =
      containerRef.current?.clientHeight ?? window.innerHeight ?? 900;
    const nextBottom = Math.max(
      0,
      Math.min(
        Math.max(0, viewportHeight - avatarHeight - 12),
        drag.originBottom - deltaY,
      ),
    );

    setManualTargetX(nextX);
    setManualBottom(nextBottom);
    currentXRef.current = nextX;
    stageXRef.current = nextX;
    setStageX(nextX);
    targetXRef.current = nextX;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isSidebar) return;
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
  };

  const avatarNode = (
    <>
      <div
        className="absolute"
        style={{
          left: stageX,
          bottom: effectiveBottom,
          width: avatarWidth,
          height: avatarHeight,
        }}
      >
        {bubbleVisible ? (
          <div
        className="absolute -top-2 left-1/2 z-30 w-max max-w-[340px] -translate-x-1/2 overflow-hidden rounded-[22px] border px-3.5 py-2.5 text-[12px] leading-5 shadow-[0_12px_36px_rgba(15,23,42,0.12)] backdrop-blur-md"
            style={{
              borderColor: bubbleTheme.borderColor,
              color: bubbleTheme.textColor,
              backgroundImage: `linear-gradient(118deg, ${bubbleTheme.backgroundFrom}, ${bubbleTheme.backgroundTo})`,
              boxShadow: `0 8px 30px ${bubbleTheme.glowColor}`,
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  "linear-gradient(125deg, transparent 10%, rgba(255,255,255,0.35) 42%, transparent 74%)",
                backgroundSize: "210% 210%",
                animation: "avatarBubbleShimmer 6.8s ease-in-out infinite",
              }}
            />
            {activeDirective.bubble.trim()}
          </div>
        ) : null}
        <div
          className="pointer-events-auto relative h-full w-full cursor-pointer overflow-visible bg-transparent"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="button"
          aria-label="拖动角色"
          title="拖动可以换位置"
        >
          <div ref={mountRef} className="h-full w-full" />
        </div>
      </div>
    </>
  );

  return (
    <div
      ref={containerRef}
      suppressHydrationWarning
      className={
        isSidebar
          ? "pointer-events-none relative h-[236px] w-full overflow-visible bg-transparent"
          : "pointer-events-none fixed inset-0 z-[160] overflow-visible"
      }
      style={isSidebar ? undefined : { height: "100vh" }}
    >
      {avatarNode}
      <style jsx>{`
        @keyframes avatarBubbleShimmer {
          0% {
            transform: translate3d(-28%, 0, 0);
            filter: hue-rotate(0deg);
          }
          50% {
            transform: translate3d(12%, 0, 0);
            filter: hue-rotate(14deg);
          }
          100% {
            transform: translate3d(-28%, 0, 0);
            filter: hue-rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
}
