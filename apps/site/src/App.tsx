const heroVideoUrl =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4.mp4';

const releaseVersion = 'v0.2.14';
const releaseUrl = 'https://github.com/ErKeLost/Rovix-Agent/releases/tag/v0.2.14';
const macAppleSiliconUrl =
  'https://github.com/ErKeLost/Rovix-Agent/releases/download/v0.2.14/Rovix_0.2.14_aarch64.dmg';
const macIntelUrl =
  'https://github.com/ErKeLost/Rovix-Agent/releases/download/v0.2.14/Rovix_0.2.14_x64.dmg';

const headerLinks = [
  { label: 'Product', href: '#product' },
  { label: 'Docs', href: '#docs' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Developers', href: '#developers' },
];

const platformLinks = [
  { label: 'macOS Apple Silicon', href: macAppleSiliconUrl, direct: true },
  { label: 'macOS Intel', href: macIntelUrl, direct: true },
  { label: 'Windows', href: releaseUrl, direct: false },
  { label: 'Linux', href: releaseUrl, direct: false },
];

export default function App() {
  return (
    <main className="bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <section className="relative isolate flex h-[100svh] max-h-[100vh] min-h-screen overflow-hidden bg-[hsl(var(--background))]">
        <video
          className="absolute inset-0 z-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={heroVideoUrl} type="video/mp4" />
        </video>

        <div className="absolute inset-0 z-[1] bg-black/42" aria-hidden="true" />
        <div
          className="absolute inset-x-0 bottom-0 z-[1] h-[44%] bg-gradient-to-t from-[rgba(4,6,12,0.96)] via-[rgba(4,6,12,0.56)] to-transparent"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.12),transparent_24%),radial-gradient(circle_at_82%_20%,rgba(245,197,130,0.14),transparent_18%),radial-gradient(circle_at_50%_72%,rgba(124,154,255,0.12),transparent_28%)]"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-[76rem] flex-col px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-5 md:px-8 md:pb-12 md:pt-6">
          <header className="animate-fade-rise mx-auto w-full max-w-[72rem]">
            <nav className="header-shell flex items-center justify-between gap-4 rounded-[1.45rem] px-4 py-3 sm:px-5 md:px-6">
              <a href={macAppleSiliconUrl} className="flex items-center gap-3 text-[hsl(var(--foreground))]">
                <span className="text-[1.1rem] font-semibold tracking-[-0.03em]">Rovix</span>
              </a>

              <div className="hidden items-center gap-7 text-sm text-[hsl(var(--foreground-muted))] md:flex">
                {headerLinks.map((link) => (
                  <a key={link.label} href={link.href} className="header-link transition-colors duration-300 hover:text-[hsl(var(--foreground))]">
                    {link.label}
                  </a>
                ))}
              </div>

              <a
                href={macAppleSiliconUrl}
                target="_blank"
                rel="noreferrer"
                className="header-download rounded-full px-4 py-2 text-sm font-medium transition-transform duration-300 hover:scale-[1.03] sm:px-5"
              >
                Download
              </a>
            </nav>
          </header>

          <div className="flex flex-1 items-center justify-center px-1 pb-6 pt-8 sm:px-3 sm:pb-8 sm:pt-10 md:pb-10 md:pt-14">
            <div className="hero-stack mx-auto flex w-full max-w-[56rem] flex-col items-center text-center">
              <p className="animate-fade-rise mb-5 text-[0.72rem] uppercase tracking-[0.34em] text-[hsl(var(--foreground-soft))] sm:mb-6">
                Local-first AI coding workspace
              </p>

              <h1 className="animate-fade-rise hero-title max-w-[12ch] text-[clamp(3.6rem,8vw,7.2rem)] leading-[0.9] tracking-[-0.065em] text-[hsl(var(--foreground))]">
                One place to
                <br />
                plan, patch, and ship.
              </h1>

              <p className="animate-fade-rise-delay mt-6 max-w-[44rem] text-balance text-[1rem] leading-[1.55] text-[hsl(var(--foreground-soft))] sm:text-[1.12rem]">
                Plan, inspect, edit, and run your workspace in one quieter flow. Rovix keeps the whole coding loop close,
                so you can move from idea to patch without losing context.
              </p>

              <div className="animate-fade-rise-delay-2 mt-10 flex flex-col items-center gap-3 sm:flex-row">
                <a
                  href={macAppleSiliconUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hero-button inline-flex min-w-[13.5rem] items-center justify-center rounded-[1rem] px-6 py-3.5 text-sm font-semibold transition-transform duration-300 hover:scale-[1.02]"
                >
                  Download for Mac
                </a>
                <a
                  href={releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hero-outline inline-flex min-w-[13.5rem] items-center justify-center rounded-[1rem] px-6 py-3.5 text-sm font-semibold transition-colors duration-300"
                >
                  Download for Windows
                </a>
              </div>

              <div id="platforms" className="animate-fade-rise-delay-2 mt-8 flex flex-wrap items-center justify-center gap-2.5 text-sm text-[hsl(var(--foreground-soft))]">
                {platformLinks.map((platform) => (
                  <a
                    key={platform.label}
                    href={platform.href}
                    target="_blank"
                    rel="noreferrer"
                    className={platform.direct ? 'platform-pill' : 'platform-pill platform-pill-muted'}
                  >
                    {platform.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}