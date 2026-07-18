# Development packages

> **These packages track Folea's `develop` branch and may contain unstable or incomplete changes.**

Every published package records the full source commit in `build-info`. Packaging runs use the exact
triggering commit, never `main`, a tag, a GitHub Release, or a mutable branch archive.

## Windows — Scoop

```powershell
scoop bucket add folea https://github.com/ivanovanatoliy/scoop-folea
scoop install folea-dev
scoop update folea-dev
Get-Content "$(scoop prefix folea-dev)\app\resources\build-info"
```

The manifest downloads the immutable GitHub archive for one full commit SHA, verifies its SHA-256,
then runs `npm ci` and builds the unpacked application locally with Node.js 22. Scoop owns the
`Folea Dev` shortcut, the `folea-dev` shim, updates, and removal. If Scoop has not enabled its
`versions` bucket yet, run `scoop bucket add versions` once so it can install `nodejs22`.

## macOS — Homebrew HEAD

```bash
brew install --HEAD ivanovanatoliy/folea/folea
folea --build-info
```

Fetch and rebuild the latest `develop` commit with:

```bash
brew update
brew reinstall --HEAD ivanovanatoliy/folea/folea
```

The HEAD formula clones `develop`, runs `npm ci`, builds an unpacked `.app`, and applies a local
ad-hoc signature. It does not use an Apple Developer certificate or notarization.

## Arch Linux / Manjaro / EndeavourOS — AUR

```bash
yay -S folea-git
folea --build-info
```

`folea-git` builds the `develop` branch locally and reports versions such as `r142.gabcdef1`.
Some AUR helpers do not consider VCS packages outdated automatically. Enable development-package
update checking in the helper or explicitly request a rebuild to receive new upstream commits.
The AUR repository is updated only when the PKGBUILD changes, not for every Folea commit.

## Debian / Ubuntu / Linux Mint — APT

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://ivanovanatoliy.github.io/folea-packages/repo-signing-key.asc \
  | sudo tee /etc/apt/keyrings/folea-packages.asc >/dev/null
curl -fsSL https://ivanovanatoliy.github.io/folea-packages/apt/folea.sources \
  | sudo tee /etc/apt/sources.list.d/folea.sources >/dev/null
sudo apt update
sudo apt install folea-dev
folea --build-info
```

Updates arrive normally:

```bash
sudo apt update
sudo apt upgrade
```

Repository metadata is signed and the source uses a dedicated key under `/etc/apt/keyrings`. Do not
use `apt-key`, `trusted=yes`, or `allow-insecure-repositories`.

Validated distributions: Debian 13 and Ubuntu 24.04. Linux Mint releases based on Ubuntu 24.04 use
the same package, but are not a separate CI target.

## Fedora — DNF

```bash
sudo curl -fsSL https://ivanovanatoliy.github.io/folea-packages/rpm/folea.repo \
  -o /etc/yum.repos.d/folea.repo
sudo dnf install folea-dev
folea --build-info
sudo dnf upgrade folea-dev
```

Both RPM packages and repository metadata are signed. `gpgcheck` and `repo_gpgcheck` remain enabled.
Validated releases: Fedora 43 and Fedora 44. No RHEL, Rocky Linux, AlmaLinux, or openSUSE
compatibility is claimed.

## Other Linux — AppImage

```bash
curl -fLO https://ivanovanatoliy.github.io/folea-packages/appimage/folea-dev-linux-x64.AppImage
curl -fLO https://ivanovanatoliy.github.io/folea-packages/appimage/folea-dev-linux-x64.AppImage.sha256
sha256sum --check folea-dev-linux-x64.AppImage.sha256
chmod +x folea-dev-linux-x64.AppImage
./folea-dev-linux-x64.AppImage --build-info
```

The same directory contains an immutable `folea-dev-<short-sha>-linux-x64.AppImage` for each build
and `folea-dev-linux-x64.AppImage.build-info` for the current build.

## Publication and required maintainer setup

The source workflow is `.github/workflows/develop-packaging.yml`. It publishes only after unit,
E2E, Scoop, Homebrew, AUR, DEB, RPM, repository-signature, install, upgrade, and removal checks pass.
Generated artifacts and repository metadata go to separate repositories, never Folea's `develop`
branch.

These public repositories now exist with `develop` as their default branch:

- `ivanovanatoliy/folea-packages` — GitHub Pages, APT, DNF, AppImage;
- `ivanovanatoliy/scoop-folea` — `bucket/folea-dev.json`;
- `ivanovanatoliy/homebrew-folea` — `Formula/folea.rb`.

GitHub Pages is enabled for the root of `folea-packages`' `develop` branch. The Folea repository has
a protected Actions environment named `packaging`, restricted to `develop`. Add these secrets:

- `PACKAGING_REPOS_TOKEN`: an expiring fine-grained token limited to **Contents: read/write** on
  only the three repositories above;
- `PACKAGE_REPO_GPG_PRIVATE_KEY`: ASCII-armored private signing key;
- `PACKAGE_REPO_GPG_PASSPHRASE`: that key's passphrase.

Create the token at <https://github.com/settings/personal-access-tokens/new>: select only the three
package repositories, grant repository **Contents: read and write**, and set an expiry. Save it with:

```bash
gh secret set PACKAGING_REPOS_TOKEN --repo ivanovanatoliy/folea --env packaging
```

Do not use a classic broadly scoped PAT. Do not commit the token, private key, passphrase, SSH keys,
or generated credentials.

One way to create the dedicated signing key and secrets is:

```bash
gpg --quick-generate-key 'Folea Package Repository <maintainers@folea.dev>' rsa4096 sign 2y
gpg --armor --export-secret-keys 'Folea Package Repository' > /tmp/folea-repo-private.asc
gh secret set PACKAGE_REPO_GPG_PRIVATE_KEY --repo ivanovanatoliy/folea --env packaging \
  < /tmp/folea-repo-private.asc
gh secret set PACKAGE_REPO_GPG_PASSPHRASE --repo ivanovanatoliy/folea --env packaging
shred -u /tmp/folea-repo-private.asc
```

Keep an encrypted offline backup of the private key and its revocation certificate. The workflow
exports only the public key to `folea-packages`.

To publish the AUR recipe, add the public half of a dedicated SSH key to an AUR account, then:

```bash
git clone ssh://aur@aur.archlinux.org/folea-git.git
cp packaging/aur/{PKGBUILD,folea.desktop,folea.sh} folea-git/
(cd folea-git && makepkg --printsrcinfo > .SRCINFO)
git -C folea-git add PKGBUILD .SRCINFO folea.desktop folea.sh
git -C folea-git commit -m 'Add Folea develop package'
git -C folea-git push
```

The optional Flatpak repository is intentionally deferred. Add it only after a portal-based vault
picker can replace broad host filesystem access and the Electron base-app/runtime version is pinned
and tested.
