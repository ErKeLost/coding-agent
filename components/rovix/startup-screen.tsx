import { LoaderCircleIcon, SquareTerminalIcon } from "lucide-react";

type StartupScreenProps = {
  label?: string;
  detail?: string;
};

export function StartupScreen({
  label = "正在启动工作区",
  detail = "加载界面、恢复线程和本地运行时",
}: StartupScreenProps) {
  return (
    <div className="app-shell relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute left-[8%] top-[12%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(214,170,91,0.18),transparent_68%)] blur-2xl" />
        <div className="absolute bottom-[10%] right-[10%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(104,149,255,0.16),transparent_72%)] blur-3xl" />
      </div>

      <div className="app-panel relative w-[min(560px,calc(100vw-32px))] rounded-[30px] px-8 py-10">
        <div className="flex items-start gap-4">
          <div className="app-soft-card flex size-14 items-center justify-center rounded-2xl border border-white/8">
            <SquareTerminalIcon className="size-6 text-cyan-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium tracking-[0.24em] text-muted-foreground/70 uppercase">
              Rovix
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {label}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {detail}
            </p>
          </div>
          <LoaderCircleIcon className="mt-1 size-5 animate-spin text-muted-foreground/75" />
        </div>

        <div className="mt-8 space-y-3">
          <div className="h-2 overflow-hidden rounded-full bg-white/6">
            <div className="h-full w-1/3 animate-[startup-slide_1.25s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-400/70 via-sky-300/75 to-amber-300/65" />
          </div>
          <div className="grid gap-2">
            <div className="h-10 rounded-2xl border border-white/6 bg-white/[0.04]" />
            <div className="h-10 rounded-2xl border border-white/5 bg-white/[0.03]" />
            <div className="h-10 rounded-2xl border border-white/4 bg-white/[0.025]" />
          </div>
        </div>
      </div>
    </div>
  );
}
