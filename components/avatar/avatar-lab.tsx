"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

type Emotion = "neutral" | "happy" | "thinking" | "serious" | "excited";
type Gesture = "idle" | "nod" | "wave" | "focus";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type ChatResponse = {
  reply: string;
  emotion: Emotion;
  gesture: Gesture;
};

const EMOTION_COLORS: Record<Emotion, string> = {
  neutral: "#d4d8e2",
  happy: "#ffd89c",
  thinking: "#a9d0ff",
  serious: "#d6d6d6",
  excited: "#ffd0a8",
};

export function AvatarLab() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const speakingRef = useRef(false);
  const gestureRef = useRef<Gesture>("idle");
  const emotionRef = useRef<Emotion>("neutral");

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "你好，我已经上线了。你可以让我做自我介绍，或者问我今天要做什么。" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [emotion, setEmotion] = useState<Emotion>("neutral");
  const [gesture, setGesture] = useState<Gesture>("idle");
  const [sceneReady, setSceneReady] = useState(false);

  const aura = useMemo(() => EMOTION_COLORS[emotion], [emotion]);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    gestureRef.current = gesture;
  }, [gesture]);

  useEffect(() => {
    speakingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b0f17");

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 1.6, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 1.6;
    controls.maxDistance = 6;
    controls.target.set(0, 1.35, 0);

    const hemi = new THREE.HemisphereLight(0xdde8ff, 0x1b2235, 1.1);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 5, 3);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rim = new THREE.DirectionalLight(0x9fb2ff, 0.4);
    rim.position.set(-4, 2, -3);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 64),
      new THREE.MeshStandardMaterial({
        color: "#0f1420",
        roughness: 0.9,
        metalness: 0.1,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    const loader = new FBXLoader();
    loader.load(
      "/models/pop.fbx",
      (fbx) => {
        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z);
        const scale = maxAxis > 0 ? 1.8 / maxAxis : 1;
        fbx.scale.setScalar(scale);
        box.setFromObject(fbx);
        const center = box.getCenter(new THREE.Vector3());
        fbx.position.x -= center.x;
        fbx.position.z -= center.z;
        fbx.position.y -= box.min.y;
        fbx.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        scene.add(fbx);
        modelRef.current = fbx;

        if (fbx.animations.length) {
          const mixer = new THREE.AnimationMixer(fbx);
          const clip = fbx.animations[0];
          const action = mixer.clipAction(clip);
          action.play();
          mixerRef.current = mixer;
        }
        setSceneReady(true);
      },
      undefined,
      (error) => {
        console.error("Failed to load FBX model", error);
      },
    );

    const clock = new THREE.Clock();

    let rafId = 0;

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;

      mixerRef.current?.update(delta);
      controls.update();

      const model = modelRef.current;
      if (model) {
        const idleSway = Math.sin(elapsed * 0.55) * 0.1;
        model.rotation.y = idleSway;

        if (speakingRef.current) {
          model.position.y = 0.01 + Math.sin(elapsed * 7) * 0.02;
        } else {
          model.position.y = 0;
        }

        if (gestureRef.current === "nod") {
          model.rotation.x = Math.sin(elapsed * 9) * 0.05;
        } else if (gestureRef.current === "focus") {
          model.rotation.x = -0.03;
        } else {
          model.rotation.x = 0;
        }
      }

      hemi.color.set(EMOTION_COLORS[emotionRef.current]);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const nextWidth = mount.clientWidth;
      const nextHeight = mount.clientHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      mixerRef.current?.stopAllAction();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => {
      speakingRef.current = true;
    };
    utterance.onend = () => {
      speakingRef.current = false;
      setGesture("idle");
    };
    window.speechSynthesis.speak(utterance);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text }]);

    try {
      const response = await fetch("/api/avatar/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error("avatar chat request failed");
      }

      const payload = (await response.json()) as ChatResponse;
      setEmotion(payload.emotion ?? "neutral");
      setGesture(payload.gesture ?? "idle");
      setMessages((prev) => [...prev, { role: "assistant", text: payload.reply }]);
      speak(payload.reply);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "刚才我有点卡住了。你再说一次，我会继续接上。",
        },
      ]);
      setEmotion("thinking");
      setGesture("focus");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090d14] text-[#e8eef8]">
      <div className="relative flex-1 border-r border-white/10">
        <div ref={mountRef} className="h-screen w-full" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,168,255,0.18),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(255,170,96,0.12),transparent_40%)]" />
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs text-white/90 backdrop-blur">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: aura }} />
          {sceneReady ? "模型已加载" : "模型加载中"}
          <span className="text-white/50">|</span>
          情绪: {emotion}
          <span className="text-white/50">|</span>
          动作: {gesture}
        </div>
      </div>

      <aside className="flex w-[390px] flex-col bg-[#0d131e]">
        <header className="border-b border-white/10 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-wide text-white/95">Avatar AI Lab</h1>
          <p className="mt-1 text-xs text-white/55">FBX 模型 + 对话 + 情绪/动作驱动（首版）</p>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
              className={
                msg.role === "user"
                  ? "ml-8 rounded-2xl rounded-br-sm bg-[#1f365f] px-3 py-2 text-sm"
                  : "mr-8 rounded-2xl rounded-bl-sm bg-[#1b2638] px-3 py-2 text-sm text-[#dbe8ff]"
              }
            >
              {msg.text}
            </div>
          ))}
        </div>

        <form onSubmit={onSubmit} className="border-t border-white/10 p-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
            placeholder="和角色说点什么，比如：请你做一个简短自我介绍"
            className="w-full resize-none rounded-xl border border-white/15 bg-[#0b1019] px-3 py-2 text-sm text-[#e8eef8] outline-none ring-0 placeholder:text-white/35 focus:border-white/30"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-[#316ddf] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#3f7bef] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "思考中..." : "发送并驱动角色"}
          </button>
        </form>
      </aside>
    </div>
  );
}
