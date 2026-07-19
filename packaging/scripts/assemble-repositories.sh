#!/usr/bin/env bash
set -euo pipefail

: "${PACKAGE_ROOT:?PACKAGE_ROOT is required}"
: "${ARTIFACT_DIR:?ARTIFACT_DIR is required}"
: "${FOLEA_COMMIT_SHA:?FOLEA_COMMIT_SHA is required}"
: "${FOLEA_SHORT_SHA:?FOLEA_SHORT_SHA is required}"
: "${GPG_KEY_ID:?GPG_KEY_ID is required}"

shopt -s nullglob
appimages=("$ARTIFACT_DIR"/*.AppImage)
debs=("$ARTIFACT_DIR"/*.deb)
rpms=("$ARTIFACT_DIR"/*.rpm)
[[ ${#appimages[@]} == 1 && ${#debs[@]} == 1 && ${#rpms[@]} == 1 ]]
[[ -f "$ARTIFACT_DIR/build-info" ]]

mkdir -p "$PACKAGE_ROOT/appimage" "$PACKAGE_ROOT/apt/pool/main/f/folea-dev"
immutable="folea-dev-${FOLEA_SHORT_SHA}-linux-x64.AppImage"
cp "${appimages[0]}" "$PACKAGE_ROOT/appimage/$immutable"
cp "${appimages[0]}" "$PACKAGE_ROOT/appimage/folea-dev-linux-x64.AppImage"
cp "$ARTIFACT_DIR/build-info" "$PACKAGE_ROOT/appimage/folea-dev-linux-x64.AppImage.build-info"
(
  cd "$PACKAGE_ROOT/appimage"
  sha256sum folea-dev-linux-x64.AppImage > folea-dev-linux-x64.AppImage.sha256
  gpg --batch --yes --local-user "$GPG_KEY_ID" --armor --detach-sign \
    --output folea-dev-linux-x64.AppImage.sha256.asc folea-dev-linux-x64.AppImage.sha256
)

cp "${debs[0]}" "$PACKAGE_ROOT/apt/pool/main/f/folea-dev/"
mkdir -p "$PACKAGE_ROOT/apt/dists/develop/main/binary-amd64"
(
  cd "$PACKAGE_ROOT/apt"
  dpkg-scanpackages -m pool/main/f/folea-dev /dev/null > dists/develop/main/binary-amd64/Packages
  gzip -9nc dists/develop/main/binary-amd64/Packages > dists/develop/main/binary-amd64/Packages.gz
  for file in Packages Packages.gz; do
    hash="$(sha256sum "dists/develop/main/binary-amd64/$file" | cut -d' ' -f1)"
    mkdir -p dists/develop/main/binary-amd64/by-hash/SHA256
    cp "dists/develop/main/binary-amd64/$file" \
      "dists/develop/main/binary-amd64/by-hash/SHA256/$hash"
  done
  apt-ftparchive \
    -o APT::FTPArchive::Release::Origin='Folea' \
    -o APT::FTPArchive::Release::Label='Folea develop' \
    -o APT::FTPArchive::Release::Suite='develop' \
    -o APT::FTPArchive::Release::Codename='develop' \
    -o APT::FTPArchive::Release::Architectures='amd64' \
    -o APT::FTPArchive::Release::Components='main' \
    -o APT::FTPArchive::Release::Acquire-By-Hash='yes' \
    release dists/develop > dists/develop/Release
  gpg --batch --yes --local-user "$GPG_KEY_ID" --armor --detach-sign \
    --output dists/develop/Release.gpg dists/develop/Release
  gpg --batch --yes --local-user "$GPG_KEY_ID" --clearsign \
    --output dists/develop/InRelease dists/develop/Release
)

rpm --define "_gpg_name $GPG_KEY_ID" --define "_gpg_path $GNUPGHOME" --addsign "${rpms[0]}"
for fedora in 43 44; do
  repo="$PACKAGE_ROOT/rpm/fedora/$fedora/x86_64"
  mkdir -p "$repo/Packages"
  cp "${rpms[0]}" "$repo/Packages/"
  createrepo_c --update "$repo"
  gpg --batch --yes --local-user "$GPG_KEY_ID" --armor --detach-sign \
    --output "$repo/repodata/repomd.xml.asc" "$repo/repodata/repomd.xml"
done

gpg --armor --export "$GPG_KEY_ID" > "$PACKAGE_ROOT/repo-signing-key.asc"
cp packaging/apt/folea.sources "$PACKAGE_ROOT/apt/folea.sources"
cp packaging/rpm/folea.repo "$PACKAGE_ROOT/rpm/folea.repo"

mkdir -p "$PACKAGE_ROOT/commits/$FOLEA_COMMIT_SHA"
cp "$ARTIFACT_DIR/build-info" "$PACKAGE_ROOT/commits/$FOLEA_COMMIT_SHA/build-info"
(
  cd "$PACKAGE_ROOT"
  find appimage apt/pool rpm -type f ! -name '*.asc' -print0 | sort -z | \
    xargs -0 sha256sum > SHA256SUMS
  gpg --batch --yes --local-user "$GPG_KEY_ID" --armor --detach-sign \
    --output SHA256SUMS.asc SHA256SUMS
)
