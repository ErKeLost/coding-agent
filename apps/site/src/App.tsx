import { useEffect, useMemo, useState } from 'react';

const heroVideoUrl =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4.mp4';

const owner = 'ErKeLost';
const repo = 'Rovix-Agent';
const fallbackReleasePage = `https://github.com/${owner}/${repo}/releases/latest`;

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type LatestReleaseState = {
  version: string;
  pageUrl: string;
  publishedAt?: string;
  body?: string;
  assets: ReleaseAsset[];
};

type DownloadTarget = {
  label: string;
  href: string;
  note: string;
  direct: boolean;
};

const formatReleaseDate = (value?: string) => {
  if (!value) return 'Latest stable build';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Latest stable build';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const matchAsset = (assets: ReleaseAsset[], predicates: Array<(name: string) => boolean>) => {
  return (
    assets.find((asset) => predicates.every((predicate) => predicate(asset.name.toLowerCase()))) ?? null
  );
};

const getPlatform = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const platform = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();

  if (platform.includes('mac')) {
    if (platform.includes('arm') || platform.includes('apple')) return 'mac-arm';
    return 'mac-intel';
  }

  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux')) return 'linux';
  return 'unknown';
};

const createFallbackTargets = (): DownloadTarget[] => [
  {
    label: 'macOS Apple Silicon',
    href: fallbackReleasePage,
    note: 'Open latest release',
    direct: false,
  },
  {
    label: 'macOS Intel',
    href: fallbackReleasePage,
    note: 'Open latest release',
    direct: false,
  },
  {
    label: 'Windows',
    href: fallbackReleasePage,
    note: 'Open latest release',
    direct: false,
  },
  {
    label: 'Linux',
    href: fallbackReleasePage,
    note: 'Open latest release',
    direct: false,
  },
];

const resolveTargets = (release: LatestReleaseState | null): DownloadTarget[] => {
  if (!release) return createFallbackTargets();

  const macArm = matchAsset(release.assets, [
    (name) => name.endsWith('.dmg'),
    (name) => name.includes('aarch64') || name.includes('arm64'),
  ]);
  const macIntel = matchAsset(release.assets, [
    (name) => name.endsWith('.dmg'),
    (name) => name.includes('x64') || name.includes('x86_64') || name.includes('intel'),
  ]);
  const windows =
    matchAsset(release.assets, [
      (name) => name.endsWith('.msi'),
      (name) => name.includes('x64') || name.includes('x86_64') || name.includes('windows'),
    ]) ??
    matchAsset(release.assets, [
      (name) => name.endsWith('.exe'),
      (name) => name.includes('x64') || name.includes('x86_64') || name.includes('windows'),
    ]);
  const linux =
    matchAsset(release.assets, [(name) => name.endsWith('.appimage')]) ??
    matchAsset(release.assets, [(name) => name.endsWith('.deb')]) ??
    matchAsset(release.assets, [(name) => name.endsWith('.rpm')]);

  return [
    {
      label: 'macOS Apple Silicon',
      href: macArm?.browser_download_url ?? release.pageUrl,
      note: macArm ? 'Direct installer' : 'Open release assets',
      direct: Boolean(macArm),
    },
    {
      label: 'macOS Intel',
      href: macIntel?.browser_download_url ?? release.pageUrl,
      note: macIntel ? 'Direct installer' : 'Open release assets',
      direct: Boolean(macIntel),
    },
    {
      label: 'Windows',
      href: windows?.browser_download_url ?? release.pageUrl,
      note: windows ? 'Direct installer' : 'Open release assets',
      direct: Boolean(windows),
    },
    {
      label: 'Linux',
      href: linux?.browser_download_url ?? release.pageUrl,
      note: linux ? 'Direct installer' : 'Open release assets',
      direct: Boolean(linux),
    },
  ];
};

const getPrimaryTarget = (targets: DownloadTarget[]) => {
  const platform = getPlatform();

  if (platform === 'mac-arm') {
    return targets[0];
  }
  if (platform === 'mac-intel') {
    return targets[1];
  }
  if (platform === 'windows') {
    return targets[2];
  }
  if (platform === 'linux') {
    return targets[3];
  }

  return targets[0] ?? targets[2] ?? targets[1];
};

export default function App() {
  const [release, setRelease] = useState<LatestReleaseState | null>(null);
  const [releaseError, setReleaseError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadLatestRelease = async () => {
      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
          headers: {
            Accept: 'application/vnd.github+json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to load latest release');
        }

        const payload = (await response.json()) as {
          tag_name?: string;
          html_url?: string;
          published_at?: string;
          body?: string;
          assets?: Array<{ name?: string; browser_download_url?: string }>;
        };

        if (cancelled) return;

        setRelease({
          version: payload.tag_name?.trim() || 'Latest',
          pageUrl: payload.html_url?.trim() || fallbackReleasePage,
          publishedAt: payload.published_at,
          body: payload.body,
          assets: Array.isArray(payload.assets)
            ? payload.assets
                .filter(
                  (asset): asset is { name: string; browser_download_url: string } =>
                    typeof asset.name === 'string' && typeof asset.browser_download_url === 'string',
                )
                .map((asset) => ({
                  name: asset.name,
                  browser_download_url: asset.browser_download_url,
                }))
            : [],
        });
        setReleaseError(false);
      } catch {
        if (cancelled) return;
        setReleaseError(true);
      }
    };

    void loadLatestRelease();

    return () => {
      cancelled = true;
    };
  }, []);

  const targets = useMemo(() => resolveTargets(release), [release]);
  const primaryTarget = useMemo(() => getPrimaryTarget(targets), [targets]);
  const macTarget = targets[0] ?? primaryTarget;
  const windowsTarget = targets[2] ?? primaryTarget;
  const releaseLabel = release?.version ?? 'Latest release';
  const releaseDateLabel = formatReleaseDate(release?.publishedAt);
  const primaryLabel = releaseError ? 'Open latest release' : 'Latest stable build';
  const releasePage = release?.pageUrl ?? fallbackReleasePage;

  return (
    <main className="site-shell">
      <section className="hero-section">
        <video
          className="hero-video"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={heroVideoUrl} type="video/mp4" />
        </video>

        <div className="hero-wash" aria-hidden="true" />
        <div className="hero-grid" aria-hidden="true" />

        <div className="hero-frame">
          <div className="hero-body">
            <div className="hero-copy hero-copy-simple">
              <a href={releasePage} target="_blank" rel="noreferrer" className="brand-mark">
                <span className="brand-halo" aria-hidden="true" />
                <img className="brand-logo hero-brand-logo" src="/logo.png" alt="Rovix logo" width="120" height="120" />
                <span className="brand-copy hero-brand-copy">
                  <strong>Rovix</strong>
                  <span>{releaseLabel}</span>
                </span>
              </a>

              <h1 className="hero-heading hero-heading-simple">Your shortcut to AI coding.</h1>
              <p className="hero-description hero-description-simple">One workspace. Agent to patch.</p>

              <div className="hero-actions hero-actions-simple">
                <a
                  href={macTarget.href}
                  target="_blank"
                  rel="noreferrer"
                  className="primary-download simple-download"
                >
                  Download for Mac
                </a>
                <a
                  href={windowsTarget.href}
                  target="_blank"
                  rel="noreferrer"
                  className="secondary-download simple-download"
                >
                  Download for Windows
                </a>
              </div>

              <div className="release-meta release-meta-simple" aria-live="polite">
                <span>{releaseDateLabel}</span>
                <span className="meta-dot" aria-hidden="true">•</span>
                <span>{primaryLabel}</span>
              </div>

              {releaseError ? (
                <p className="status-copy status-copy-simple">
                  Release metadata is unavailable right now. Downloads fall back to the latest GitHub release page.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}